from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models import KommoConfig, Lead, Message

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CONFIG_PATH = DATA_DIR / "config.json"
STATE_PATH = DATA_DIR / "state.json"


def _default_config() -> dict[str, Any]:
    """Configuración basada en el Kommo real de Bodasesor."""
    return {
        "account_name": "Bodasesor · Kommo Simulador",
        "pipelines": [
            {
                "id": "pipeline_bodasesor",
                "name": "Pipeline principal",
                "stages": [
                    {"id": "stage_datos_intereses", "name": "Datos e Interesess del cliente", "color": "#99ccff", "sort": 0},
                    {"id": "stage_humano_trabaja", "name": "Humano Trabaja", "color": "#ffb3ba", "sort": 1},
                    {"id": "stage_cotizacion", "name": "Cotización realizada", "color": "#b5e8b5", "sort": 2},
                    {"id": "stage_seguimiento_1", "name": "Seguimiento primer mensaje", "color": "#d4b5ff", "sort": 3},
                    {"id": "stage_seguimiento_2", "name": "Seguimineto 2do mensaje", "color": "#99ccff", "sort": 4},
                    {"id": "stage_intencion_pago", "name": "Intención de paga", "color": "#b5e8b5", "sort": 5},
                    {"id": "stage_no_contesta", "name": "CLiente no contesta", "color": "#ffb3a7", "sort": 6},
                    {"id": "stage_cerrado", "name": "Cliente cerrado", "color": "#a8ff60", "sort": 7},
                    {"id": "stage_perdido", "name": "Cliente perdido", "color": "#c0c0c0", "sort": 8},
                ],
            }
        ],
        "custom_fields": [
            {"id": "cf_presupuesto", "name": "Presupuesto", "field_type": "text", "required": False},
            {"id": "cf_currency", "name": "Currency", "field_type": "text", "required": False},
            {"id": "cf_external_id", "name": "External id", "field_type": "text", "required": False},
            {"id": "cf_fulfillment_status", "name": "Fulfillment status", "field_type": "select", "options": [], "required": False},
            {"id": "cf_order_status", "name": "Order status", "field_type": "select", "options": [], "required": False},
            {"id": "cf_payment_status", "name": "Payment status", "field_type": "select", "options": [], "required": False},
            {"id": "cf_order_link", "name": "Order link", "field_type": "text", "required": False},
            {"id": "cf_direccion", "name": "Dirección del evento", "field_type": "text", "required": False},
            {"id": "cf_requerimiento", "name": "Requerimiento", "field_type": "text", "required": False},
            {"id": "cf_fecha_horario", "name": "Fecha Y horari", "field_type": "text", "required": False},
            {"id": "cf_num_invitados", "name": "Numero de Inv", "field_type": "number", "required": False},
            {"id": "cf_tipo_evento", "name": "Tipo de evento", "field_type": "text", "required": False},
            {"id": "cf_presupuesto_evento", "name": "Presupuesto (evento)", "field_type": "text", "required": False},
            {"id": "cf_respuesta_ia_1", "name": "Respuesta IA 1", "field_type": "text", "required": False},
        ],
    }


def _default_state() -> dict[str, Any]:
    return {
        "next_lead_id": 1002,
        "next_message_id": 2,
        "leads": [
            {
                "id": 1001,
                "name": "Montserrat",
                "pipeline_id": "pipeline_bodasesor",
                "stage_id": "stage_datos_intereses",
                "contact_phone": "+5217714843674",
                "contact_email": "lupitamonse269@icloud.com",
                "custom_fields": {
                    "cf_presupuesto": "$0",
                    "cf_direccion": "pachuca",
                    "cf_requerimiento": "Info pendiente",
                    "cf_fecha_horario": "sábado 18 de Julio",
                    "cf_num_invitados": 70,
                    "cf_tipo_evento": "fiesta",
                },
                "tags": ["whatsapp_business"],
                "responsible": "Bodasesor",
            }
        ],
        "messages": {
            "1001": [
                {
                    "id": 1,
                    "lead_id": 1001,
                    "direction": "incoming",
                    "text": "Hola, quiero información para una fiesta el 18 de julio en Pachuca, somos 70 personas",
                    "author": "Montserrat",
                    "created_at": "2026-07-06T16:00:00Z",
                }
            ]
        },
        "activity_log": [],
    }


class JsonStore:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if not CONFIG_PATH.exists():
            CONFIG_PATH.write_text(json.dumps(_default_config(), ensure_ascii=False, indent=2), encoding="utf-8")
        if not STATE_PATH.exists():
            STATE_PATH.write_text(json.dumps(_default_state(), ensure_ascii=False, indent=2), encoding="utf-8")

    def _read(self, path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))

    def _write(self, path: Path, data: dict[str, Any]) -> None:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_config(self) -> KommoConfig:
        return KommoConfig.model_validate(self._read(CONFIG_PATH))

    def save_config(self, config: KommoConfig) -> KommoConfig:
        self._write(CONFIG_PATH, config.model_dump())
        return config

    def get_state(self) -> dict[str, Any]:
        return self._read(STATE_PATH)

    def save_state(self, state: dict[str, Any]) -> None:
        self._write(STATE_PATH, state)

    def list_leads(self) -> list[Lead]:
        state = self.get_state()
        return [Lead.model_validate(item) for item in state["leads"]]

    def get_lead(self, lead_id: int) -> Lead | None:
        for lead in self.list_leads():
            if lead.id == lead_id:
                return lead
        return None

    def create_lead(self, payload: dict[str, Any]) -> Lead:
        state = self.get_state()
        lead_id = state["next_lead_id"]
        state["next_lead_id"] += 1
        lead = Lead(id=lead_id, **payload)
        state["leads"].append(lead.model_dump())
        state["messages"][str(lead_id)] = []
        self._log(state, "lead_created", f"Lead {lead.name} creado en {lead.stage_id}")
        self.save_state(state)
        return lead

    def update_lead(self, lead_id: int, updates: dict[str, Any]) -> Lead | None:
        state = self.get_state()
        for idx, item in enumerate(state["leads"]):
            if item["id"] == lead_id:
                merged = {**item, **{k: v for k, v in updates.items() if v is not None}}
                if updates.get("custom_fields") is not None:
                    merged["custom_fields"] = {**item.get("custom_fields", {}), **updates["custom_fields"]}
                if updates.get("stage_id") and updates["stage_id"] != item.get("stage_id"):
                    self._log(state, "stage_moved", f"Lead {lead_id} → {updates['stage_id']}")
                state["leads"][idx] = merged
                self.save_state(state)
                return Lead.model_validate(merged)
        return None

    def list_messages(self, lead_id: int) -> list[Message]:
        state = self.get_state()
        raw = state["messages"].get(str(lead_id), [])
        return [Message.model_validate(item) for item in raw]

    def add_message(self, lead_id: int, direction: str, text: str, author: str) -> Message:
        state = self.get_state()
        message_id = state["next_message_id"]
        state["next_message_id"] += 1
        message = Message(
            id=message_id,
            lead_id=lead_id,
            direction=direction,
            text=text,
            author=author,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        bucket = state["messages"].setdefault(str(lead_id), [])
        bucket.append(message.model_dump())
        self._log(state, "message", f"[{direction}] {author}: {text[:80]}")
        self.save_state(state)
        return message

    def get_activity(self, limit: int = 50) -> list[dict[str, Any]]:
        state = self.get_state()
        return list(reversed(state.get("activity_log", [])[-limit:]))

    def _log(self, state: dict[str, Any], event_type: str, detail: str) -> None:
        state.setdefault("activity_log", []).append(
            {
                "at": datetime.now(timezone.utc).isoformat(),
                "type": event_type,
                "detail": detail,
            }
        )

    def reset_demo(self) -> None:
        CONFIG_PATH.write_text(json.dumps(_default_config(), ensure_ascii=False, indent=2), encoding="utf-8")
        STATE_PATH.write_text(json.dumps(_default_state(), ensure_ascii=False, indent=2), encoding="utf-8")

    def export_snapshot(self) -> dict[str, Any]:
        return {
            "config": self._read(CONFIG_PATH),
            "state": deepcopy(self.get_state()),
        }


store = JsonStore()
