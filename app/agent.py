from __future__ import annotations

import json
import os
from typing import Any

import httpx
from openai import OpenAI

from app.models import Lead, KommoConfig, Message
from app.storage import store


def _stage_name(config: KommoConfig, pipeline_id: str, stage_id: str) -> str:
    for pipeline in config.pipelines:
        if pipeline.id == pipeline_id:
            for stage in pipeline.stages:
                if stage.id == stage_id:
                    return stage.name
    return stage_id


def _build_system_prompt(config: KommoConfig, lead: Lead) -> str:
    fields_desc = "\n".join(
        f"- {field.name} ({field.id}): tipo {field.field_type}"
        + (f", opciones: {', '.join(field.options)}" if field.options else "")
        for field in config.custom_fields
    )
    stages = []
    for pipeline in config.pipelines:
        if pipeline.id == lead.pipeline_id:
            stages = [f"- {stage.id}: {stage.name}" for stage in sorted(pipeline.stages, key=lambda s: s.sort)]
            break

    current_fields = json.dumps(lead.custom_fields, ensure_ascii=False)
    return f"""Eres el agente virtual de Bodasesor conectado a Kommo (simulador).
Atiendes leads por WhatsApp Business sobre fiestas, bodas y eventos.
Responde en español, claro, amable y orientado a calificar y avanzar el embudo.

PIPELINE ACTUAL: {lead.pipeline_id}
ETAPAS (usa move_lead con stage_id):
{chr(10).join(stages)}

Reglas de movimiento de etapa:
- stage_datos_intereses: lead nuevo, recopilando datos (fecha, invitados, tipo, dirección).
- stage_humano_trabaja: cliente pide humano o caso complejo.
- stage_cotizacion: ya tienes datos suficientes para cotizar.
- stage_seguimiento_1 / stage_seguimiento_2: follow-ups automáticos.
- stage_intencion_pago: cliente muestra intención de pagar.
- stage_no_contesta: sin respuesta del cliente.
- stage_cerrado / stage_perdido: cierre positivo o negativo.

CAMPOS PERSONALIZADOS (usa set_fields con el id):
{fields_desc}

Campos clave a llenar cuando el cliente los mencione:
- cf_direccion, cf_fecha_horario, cf_num_invitados, cf_tipo_evento
- cf_requerimiento (ej. "Info pendiente", "Cotización solicitada")
- cf_presupuesto / cf_presupuesto_evento
- cf_respuesta_ia_1: guarda un resumen breve de tu respuesta

LEAD ACTUAL:
- id: {lead.id}
- nombre: {lead.name}
- teléfono: {lead.contact_phone}
- responsable: {lead.responsible}
- etapa actual: {_stage_name(config, lead.pipeline_id, lead.stage_id)} ({lead.stage_id})
- campos actuales: {current_fields}

REGLAS:
1. Responde al cliente en texto natural (WhatsApp).
2. Extrae datos del mensaje y actualiza campos con set_fields.
3. Mueve etapa cuando corresponda al embudo Bodasesor.
4. No inventes precios. Si no hay datos, pide fecha, invitados, tipo de evento y ciudad/dirección.
5. Si piden humano → stage_humano_trabaja.
6. Siempre guarda resumen en cf_respuesta_ia_1.

Responde SIEMPRE en JSON válido con esta forma:
{{
  "reply": "texto para el cliente",
  "actions": [
    {{"type": "set_fields", "fields": {{"cf_ciudad": "Guadalajara"}}}},
    {{"type": "move_lead", "stage_id": "stage_contactado", "reason": "respondió y dio datos"}}
  ]
}}
Si no hay acciones, usa "actions": [].
"""


def _parse_agent_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    return json.loads(text)


def _apply_actions(lead_id: int, actions: list[dict[str, Any]]) -> list[str]:
    applied: list[str] = []
    for action in actions:
        action_type = action.get("type")
        if action_type == "set_fields" and action.get("fields"):
            store.update_lead(lead_id, {"custom_fields": action["fields"]})
            applied.append(f"Campos actualizados: {action['fields']}")
        elif action_type == "move_lead" and action.get("stage_id"):
            store.update_lead(lead_id, {"stage_id": action["stage_id"]})
            reason = action.get("reason", "")
            applied.append(f"Lead movido a {action['stage_id']}" + (f" ({reason})" if reason else ""))
    return applied


def _lucy_payload(lead: Lead, user_text: str, author: str) -> dict[str, Any]:
    return {
        "text": user_text,
        "lead_id": lead.id,
        "lead": lead.model_dump(),
        "message": {"text": user_text, "author": author},
    }


def _lucy_response_to_actions(data: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    lead_updates = data.get("lead_updates") or {}
    if isinstance(lead_updates, dict):
        base: dict[str, Any] = {}
        for key in ("name", "contact_email", "contact_phone"):
            if lead_updates.get(key):
                base[key] = lead_updates[key]
        if base:
            actions.append({"type": "update_lead", "fields": base})
    fields = data.get("fields")
    if isinstance(fields, dict) and fields:
        actions.append({"type": "set_fields", "fields": fields})
    stage_id = data.get("stage_id")
    if stage_id:
        actions.append({"type": "move_lead", "stage_id": stage_id, "reason": "Lucy"})
    return actions


async def _call_external_agent(payload: dict[str, Any]) -> dict[str, Any] | None:
    url = os.getenv("AGENT_WEBHOOK_URL", "").strip()
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            if data.get("reply"):
                return {
                    "reply": data["reply"],
                    "actions": _lucy_response_to_actions(data),
                }
            return data
    except Exception:
        return None


def _call_openai(system_prompt: str, history: list[Message], user_text: str) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {
            "reply": (
                "¡Hola! Soy el agente en modo demo (sin OPENAI_API_KEY). "
                "Configura AGENT_WEBHOOK_URL=http://localhost:3000/api/kommo/simulator "
                "y arranca Lucy, o pon OPENAI_API_KEY para el agente simple del simulador."
            ),
            "actions": [],
        }

    client = OpenAI(api_key=api_key)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-12:]:
        role = "user" if msg.direction == "incoming" else "assistant"
        messages.append({"role": role, "content": msg.text})
    messages.append({"role": "user", "content": user_text})

    completion = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    content = completion.choices[0].message.content or "{}"
    return _parse_agent_json(content)


async def get_agent_status() -> dict[str, Any]:
    url = os.getenv("AGENT_WEBHOOK_URL", "").strip()
    mode = "lucy" if url else "builtin"
    lucy_ok = False
    health_url = None

    if url:
        base = url.replace("/api/kommo/simulator", "").replace("/api/kommo/salesbot", "")
        health_url = f"{base.rstrip('/')}/api/health"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(health_url)
                lucy_ok = res.status_code == 200
        except Exception:
            lucy_ok = False

    return {
        "mode": mode,
        "agent_webhook_url": url or None,
        "lucy_health_url": health_url,
        "lucy_connected": lucy_ok,
        "openai_configured": bool(os.getenv("OPENAI_API_KEY", "").strip()),
    }


async def process_incoming_message(lead_id: int, user_text: str, author: str = "Cliente") -> dict[str, Any]:
    lead = store.get_lead(lead_id)
    if not lead:
        raise ValueError("Lead no encontrado")

    config = store.get_config()
    store.add_message(lead_id, "incoming", user_text, author)
    history = store.list_messages(lead_id)

    external = await _call_external_agent(_lucy_payload(lead, user_text, author))
    if external and external.get("reply"):
        agent_data = external
    else:
        system_prompt = _build_system_prompt(config, lead)
        agent_data = _call_openai(system_prompt, history, user_text)

    reply = agent_data.get("reply", "")
    actions = agent_data.get("actions", [])

    # Aplicar update_lead, set_fields, move_lead
    applied: list[str] = []
    for action in actions:
        if action.get("type") == "update_lead" and action.get("fields"):
            store.update_lead(lead_id, action["fields"])
            applied.append(f"Lead actualizado: {action['fields']}")
        elif action.get("type") == "set_fields" and action.get("fields"):
            store.update_lead(lead_id, {"custom_fields": action["fields"]})
            applied.append(f"Campos: {list(action['fields'].keys())}")
        elif action.get("type") == "move_lead" and action.get("stage_id"):
            store.update_lead(lead_id, {"stage_id": action["stage_id"]})
            applied.append(f"Etapa → {action['stage_id']}")

    if reply:
        store.add_message(lead_id, "outgoing", reply, "Lucy")

    updated_lead = store.get_lead(lead_id)
    return {
        "reply": reply,
        "actions": actions,
        "applied": applied,
        "lead": updated_lead.model_dump() if updated_lead else None,
    }
