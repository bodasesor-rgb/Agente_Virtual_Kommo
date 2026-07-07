from __future__ import annotations

import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.agent import get_agent_status, process_incoming_message
from app.models import (
    AgentMoveLead,
    AgentSetFields,
    CustomFieldCreate,
    IncomingMessage,
    KommoConfig,
    LeadCreate,
    LeadUpdate,
    PipelineCreate,
    StageCreate,
)
from app.storage import store

load_dotenv()

app = FastAPI(title="Kommo Simulator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "kommo-simulator"}


@app.get("/api/agent/status")
async def agent_status() -> dict:
    return await get_agent_status()


@app.get("/api/config")
def get_config() -> KommoConfig:
    return store.get_config()


@app.put("/api/config")
def update_config(config: KommoConfig) -> KommoConfig:
    return store.save_config(config)


@app.post("/api/config/reset")
def reset_config() -> dict[str, str]:
    store.reset_demo()
    return {"status": "reset_ok"}


@app.get("/api/leads")
def list_leads() -> list[dict]:
    return [lead.model_dump() for lead in store.list_leads()]


@app.post("/api/leads")
def create_lead(payload: LeadCreate) -> dict:
    config = store.get_config()
    pipeline = next((p for p in config.pipelines if p.id == payload.pipeline_id), None)
    if not pipeline:
        raise HTTPException(status_code=400, detail="Pipeline no encontrado")

    stage_id = payload.stage_id or sorted(pipeline.stages, key=lambda s: s.sort)[0].id
    lead = store.create_lead(
        {
            "name": payload.name,
            "pipeline_id": payload.pipeline_id,
            "stage_id": stage_id,
            "contact_phone": payload.contact_phone,
            "contact_email": payload.contact_email,
            "custom_fields": payload.custom_fields,
            "tags": payload.tags,
            "responsible": payload.responsible,
        }
    )
    return lead.model_dump()


@app.get("/api/leads/{lead_id}")
def get_lead(lead_id: int) -> dict:
    lead = store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    return lead.model_dump()


@app.patch("/api/leads/{lead_id}")
def patch_lead(lead_id: int, payload: LeadUpdate) -> dict:
    lead = store.update_lead(lead_id, payload.model_dump(exclude_unset=True))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    return lead.model_dump()


@app.get("/api/leads/{lead_id}/messages")
def get_messages(lead_id: int) -> list[dict]:
    if not store.get_lead(lead_id):
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    return [msg.model_dump() for msg in store.list_messages(lead_id)]


@app.post("/api/leads/{lead_id}/messages/incoming")
async def send_incoming_message(lead_id: int, payload: IncomingMessage) -> dict:
    try:
        return await process_incoming_message(lead_id, payload.text, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error interno: {exc}. Revisa OPENAI_API_KEY y que Lucy esté corriendo.",
        ) from exc


@app.post("/api/leads/{lead_id}/agent/move")
def agent_move_lead(lead_id: int, payload: AgentMoveLead) -> dict:
    lead = store.update_lead(lead_id, {"stage_id": payload.stage_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    return {"lead": lead.model_dump(), "reason": payload.reason}


@app.post("/api/leads/{lead_id}/agent/fields")
def agent_set_fields(lead_id: int, payload: AgentSetFields) -> dict:
    lead = store.update_lead(lead_id, {"custom_fields": payload.fields})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    return {"lead": lead.model_dump()}


@app.get("/api/activity")
def activity(limit: int = 50) -> list[dict]:
    return store.get_activity(limit)


@app.post("/api/pipelines")
def create_pipeline(payload: PipelineCreate) -> dict:
    config = store.get_config()
    pipeline_id = f"pipeline_{uuid.uuid4().hex[:8]}"
    stages = []
    for idx, stage in enumerate(payload.stages):
        stages.append(
            {
                "id": f"stage_{uuid.uuid4().hex[:8]}",
                "name": stage.name,
                "color": stage.color,
                "sort": idx,
            }
        )
    if not stages:
        stages = [{"id": f"stage_{uuid.uuid4().hex[:8]}", "name": "Nuevo", "color": "#99ccff", "sort": 0}]
    config.pipelines.append({"id": pipeline_id, "name": payload.name, "stages": stages})
    saved = store.save_config(config)
    return saved.model_dump()


@app.post("/api/pipelines/{pipeline_id}/stages")
def add_stage(pipeline_id: str, payload: StageCreate) -> dict:
    config = store.get_config()
    for pipeline in config.pipelines:
        if pipeline.id == pipeline_id:
            stage = {
                "id": f"stage_{uuid.uuid4().hex[:8]}",
                "name": payload.name,
                "color": payload.color,
                "sort": len(pipeline.stages),
            }
            pipeline.stages.append(stage)
            saved = store.save_config(config)
            return saved.model_dump()
    raise HTTPException(status_code=404, detail="Pipeline no encontrado")


@app.post("/api/custom-fields")
def add_custom_field(payload: CustomFieldCreate) -> dict:
    config = store.get_config()
    field = {
        "id": f"cf_{uuid.uuid4().hex[:8]}",
        "name": payload.name,
        "field_type": payload.field_type,
        "options": payload.options,
        "required": payload.required,
    }
    config.custom_fields.append(field)
    saved = store.save_config(config)
    return saved.model_dump()


@app.get("/api/export")
def export_all() -> dict:
    return store.export_snapshot()


app.mount("/static", StaticFiles(directory="static"), name="static")
