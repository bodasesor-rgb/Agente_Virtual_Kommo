from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class Stage(BaseModel):
    id: str
    name: str
    color: str = "#4a90d9"
    sort: int = 0
    kommo_status_id: int | None = None


class Pipeline(BaseModel):
    id: str
    name: str
    kommo_pipeline_id: int | None = None
    stages: list[Stage] = Field(default_factory=list)


class CustomField(BaseModel):
    id: str
    name: str
    field_type: str = "text"  # text | number | select | checkbox | date
    options: list[str] = Field(default_factory=list)
    required: bool = False
    kommo_field_id: int | None = None


class Lead(BaseModel):
    id: int
    name: str
    pipeline_id: str
    stage_id: str
    contact_phone: str = ""
    contact_email: str = ""
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    responsible: str = "Agente Virtual"


class Message(BaseModel):
    id: int
    lead_id: int
    direction: str  # incoming | outgoing
    text: str
    author: str
    created_at: str


class KommoConfig(BaseModel):
    account_name: str = "Mi cuenta (simulador)"
    pipelines: list[Pipeline] = Field(default_factory=list)
    custom_fields: list[CustomField] = Field(default_factory=list)


class LeadCreate(BaseModel):
    name: str
    pipeline_id: str
    stage_id: str | None = None
    contact_phone: str = ""
    contact_email: str = ""
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    responsible: str = "Bodasesor"


class LeadUpdate(BaseModel):
    name: str | None = None
    pipeline_id: str | None = None
    stage_id: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    custom_fields: dict[str, Any] | None = None
    tags: list[str] | None = None


class StageCreate(BaseModel):
    name: str
    color: str = "#4a90d9"


class PipelineCreate(BaseModel):
    name: str
    stages: list[StageCreate] = Field(default_factory=list)


class CustomFieldCreate(BaseModel):
    name: str
    field_type: str = "text"
    options: list[str] = Field(default_factory=list)
    required: bool = False


class IncomingMessage(BaseModel):
    text: str
    author: str = "Cliente"


class AgentMoveLead(BaseModel):
    stage_id: str
    reason: str = ""


class AgentSetFields(BaseModel):
    fields: dict[str, Any]
