const state = {
  config: null,
  leads: [],
  selectedLeadId: null,
  activePipelineId: null,
  activeView: "pipeline",
  activeTab: "chat",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function getPipeline() {
  return state.config.pipelines.find((p) => p.id === state.activePipelineId);
}

function stageById(stageId) {
  const pipeline = getPipeline();
  return pipeline?.stages.find((s) => s.id === stageId);
}

async function loadAgentStatus() {
  try {
    const status = await api("/api/agent/status");
    const el = $("#agent-badge");
    el.classList.remove("connected", "warning");

    if (status.mode === "lucy" && status.lucy_connected && status.lucy_openai_configured) {
      el.textContent = "Lucy conectada · OpenAI OK";
      el.classList.add("connected");
    } else if (status.mode === "lucy" && status.lucy_connected && !status.lucy_openai_configured) {
      el.textContent = "Lucy online pero falta OPEN_AI en Hostinger/terminal";
      el.classList.add("warning");
    } else if (status.mode === "lucy" && !status.lucy_connected) {
      el.textContent = "Lucy no responde — revisa AGENT_WEBHOOK_URL";
      el.classList.add("warning");
    } else if (status.openai_configured) {
      el.textContent = "Agente simple (OpenAI en simulador)";
    } else {
      el.textContent = "Configura OPEN_AI en Hostinger (tu key sk-proj-...)";
      el.classList.add("warning");
    }
  } catch {
    $("#agent-badge").textContent = "Modo prueba · sin CRM real";
  }
}

async function loadAll() {
  state.config = await api("/api/config");
  state.leads = await api("/api/leads");
  state.activePipelineId = state.config.pipelines[0]?.id;
  await loadAgentStatus();
  renderAll();
}

function renderAll() {
  $("#account-name").textContent = state.config.account_name;
  $("#pipeline-label").textContent = getPipeline()?.name || "Sin pipeline";
  renderKanban();
  renderConfig();
  renderActivity();
  if (state.selectedLeadId) selectLead(state.selectedLeadId, false);
}

function renderKanban() {
  const pipeline = getPipeline();
  const board = $("#kanban");
  board.innerHTML = "";

  if (!pipeline) {
    board.innerHTML = "<p>No hay pipeline configurado.</p>";
    return;
  }

  const sortedStages = [...pipeline.stages].sort((a, b) => a.sort - b.sort);

  for (const stage of sortedStages) {
    const col = document.createElement("div");
    col.className = "stage-column";
    col.dataset.stageId = stage.id;

    const leads = state.leads.filter(
      (l) => l.pipeline_id === pipeline.id && l.stage_id === stage.id
    );

    col.innerHTML = `
      <div class="stage-header">
        <div class="stage-title" style="border-left: 4px solid ${stage.color}; padding-left: 8px;">
          ${stage.name}
        </div>
        <span class="stage-count">${leads.length}</span>
      </div>
    `;

    const dropZone = document.createElement("div");
    dropZone.className = "drop-zone";
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.style.outline = "2px dashed var(--primary)";
    });
    dropZone.addEventListener("dragleave", () => {
      col.style.outline = "none";
    });
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.style.outline = "none";
      const leadId = Number(e.dataTransfer.getData("text/lead-id"));
      await moveLead(leadId, stage.id);
    });

    for (const lead of leads) {
      dropZone.appendChild(createLeadCard(lead));
    }

    col.appendChild(dropZone);
    board.appendChild(col);
  }
}

function createLeadCard(lead) {
  const card = document.createElement("div");
  card.className = "lead-card" + (lead.id === state.selectedLeadId ? " selected" : "");
  card.draggable = true;
  card.dataset.leadId = lead.id;

  const channel = lead.tags.includes("whatsapp_business") ? "WhatsApp Business" : "Chat";

  card.innerHTML = `
    <h3>${lead.name}</h3>
    <div class="lead-meta">${channel} · ${lead.contact_phone || "Sin teléfono"}</div>
    <div class="lead-meta">Resp: ${lead.responsible}</div>
  `;

  card.addEventListener("click", () => selectLead(lead.id));
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/lead-id", String(lead.id));
  });

  return card;
}

async function moveLead(leadId, stageId) {
  await api(`/api/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ stage_id: stageId }),
  });
  state.leads = await api("/api/leads");
  renderKanban();
  toast("Lead movido de etapa");
}

async function selectLead(leadId, reloadMessages = true) {
  state.selectedLeadId = leadId;
  const lead = state.leads.find((l) => l.id === leadId);
  if (!lead) return;

  $("#lead-title").textContent = lead.name;
  $("#lead-subtitle").textContent = `${lead.contact_phone} · ${stageById(lead.stage_id)?.name || lead.stage_id}`;
  $("#btn-send").disabled = false;
  $("#btn-save-fields").disabled = false;

  renderKanban();

  if (reloadMessages) {
    const messages = await api(`/api/leads/${leadId}/messages`);
    renderChat(messages);
  }

  renderFields(lead);
}

function renderChat(messages) {
  const body = $("#chat-body");
  body.innerHTML = "";
  for (const msg of messages) {
    const div = document.createElement("div");
    div.className = `message ${msg.direction}`;
    div.innerHTML = `${msg.text}<small>${msg.author} · ${new Date(msg.created_at).toLocaleString()}</small>`;
    body.appendChild(div);
  }
  body.scrollTop = body.scrollHeight;
}

function renderFields(lead) {
  const grid = $("#fields-grid");
  grid.innerHTML = "";

  grid.innerHTML += fieldInput("Nombre", "name", "text", lead.name);
  grid.innerHTML += fieldInput("Teléfono", "contact_phone", "text", lead.contact_phone);
  grid.innerHTML += fieldInput("Correo", "contact_email", "text", lead.contact_email);
  grid.innerHTML += fieldInput("Usuario resp.", "responsible", "text", lead.responsible);

  for (const field of state.config.custom_fields) {
    const value = lead.custom_fields[field.id] ?? "";
    if (field.field_type === "select" && field.options.length) {
      grid.innerHTML += fieldSelect(field, value);
    } else {
      grid.innerHTML += fieldInput(field.name, field.id, field.field_type, value, true);
    }
  }
}

function fieldInput(label, key, type, value, isCustom = false) {
  return `
    <div class="field-row" data-key="${key}" data-custom="${isCustom}">
      <label>${label}</label>
      <input type="${type === "number" ? "number" : "text"}" value="${value ?? ""}" data-field="${key}" />
    </div>
  `;
}

function fieldSelect(field, value) {
  const options = field.options
    .map((opt) => `<option value="${opt}" ${opt === value ? "selected" : ""}>${opt}</option>`)
    .join("");
  return `
    <div class="field-row" data-key="${field.id}" data-custom="true">
      <label>${field.name}</label>
      <select data-field="${field.id}">
        <option value="">—</option>
        ${options}
      </select>
    </div>
  `;
}

function renderConfig() {
  const pipelineBox = $("#pipeline-config");
  pipelineBox.innerHTML = "";

  for (const pipeline of state.config.pipelines) {
    const stages = [...pipeline.stages]
      .sort((a, b) => a.sort - b.sort)
      .map((s) => `<span style="background:${s.color}; padding:2px 8px; border-radius:6px; margin-right:6px;">${s.name}</span>`)
      .join("");
    pipelineBox.innerHTML += `
      <div class="config-item">
        <strong>${pipeline.name}</strong>
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">${stages}</div>
      </div>
    `;
  }

  const fieldsBox = $("#fields-config");
  fieldsBox.innerHTML = state.config.custom_fields
    .map(
      (f) => `
      <div class="config-item">
        <strong>${f.name}</strong>
        <div style="color:var(--muted); font-size:12px;">ID sim: ${f.id}${f.kommo_field_id ? ` · Kommo: ${f.kommo_field_id}` : ""} · Tipo: ${f.field_type}</div>
      </div>`
    )
    .join("");
}

async function renderActivity() {
  const items = await api("/api/activity");
  $("#activity-list").innerHTML = items.length
    ? items
        .map(
          (a) => `
        <div class="activity-item">
          <div style="font-size:12px; color:var(--muted);">${new Date(a.at).toLocaleString()}</div>
          <div>${a.detail}</div>
        </div>`
        )
        .join("")
    : "<p style='padding:16px;'>Sin actividad aún.</p>";
}

async function sendMessage() {
  const text = $("#chat-text").value.trim();
  if (!text || !state.selectedLeadId) return;

  $("#btn-send").disabled = true;
  try {
    const result = await api(`/api/leads/${state.selectedLeadId}/messages/incoming`, {
      method: "POST",
      body: JSON.stringify({ text, author: state.leads.find((l) => l.id === state.selectedLeadId)?.name || "Cliente" }),
    });

    $("#chat-text").value = "";
    state.leads = await api("/api/leads");
    await selectLead(state.selectedLeadId);

    if (result.reply?.startsWith("⚠️")) {
      toast(result.reply.slice(0, 140));
    } else if (result.applied?.length) {
      toast(`Agente: ${result.applied.join(" · ")}`);
    } else {
      toast("Respuesta del agente enviada");
    }
  } catch (err) {
    toast(err.message || "Error al enviar mensaje");
  } finally {
    $("#btn-send").disabled = false;
  }
}

async function saveFields() {
  const leadId = state.selectedLeadId;
  if (!leadId) return;

  const body = { custom_fields: {} };

  $$("#fields-grid .field-row").forEach((row) => {
    const isCustom = row.dataset.custom === "true";
    const input = row.querySelector("input, select");
    if (!input) return;
    const key = input.dataset.field;
    const value = input.type === "number" && input.value !== "" ? Number(input.value) : input.value;
    if (isCustom) body.custom_fields[key] = value;
    else body[key] = value;
  });

  await api(`/api/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  state.leads = await api("/api/leads");
  await selectLead(leadId, false);
  toast("Campos guardados");
}

function bindEvents() {
  $$(".nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeView = btn.dataset.view;
      $("#view-pipeline").classList.toggle("hidden", state.activeView !== "pipeline");
      $("#view-config").classList.toggle("hidden", state.activeView !== "config");
      $("#view-activity").classList.toggle("hidden", state.activeView !== "activity");
      if (state.activeView === "activity") renderActivity();
    });
  });

  $$(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeTab = btn.dataset.tab;
      $("#tab-chat").classList.toggle("hidden", state.activeTab !== "chat");
      $("#tab-fields").classList.toggle("hidden", state.activeTab !== "fields");
    });
  });

  $("#btn-send").addEventListener("click", sendMessage);
  $("#chat-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  $("#btn-save-fields").addEventListener("click", saveFields);

  $("#btn-new-lead").addEventListener("click", async () => {
    const name = prompt("Nombre del lead:");
    if (!name) return;
    const pipeline = getPipeline();
    const stageId = [...pipeline.stages].sort((a, b) => a.sort - b.sort)[0].id;
    await api("/api/leads", {
      method: "POST",
      body: JSON.stringify({
        name,
        pipeline_id: pipeline.id,
        stage_id: stageId,
        tags: ["whatsapp_business"],
        responsible: "Bodasesor",
      }),
    });
    state.leads = await api("/api/leads");
    renderKanban();
    toast("Lead creado");
  });

  $("#btn-reset").addEventListener("click", async () => {
    if (!confirm("¿Restaurar pipeline, campos y leads de demo?")) return;
    await api("/api/config/reset", { method: "POST" });
    state.selectedLeadId = null;
    await loadAll();
    toast("Demo restaurada con tu config de Kommo");
  });

  $("#btn-export").addEventListener("click", async () => {
    const data = await api("/api/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kommo-simulator-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#form-new-pipeline").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const stages = fd
      .get("stages")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    await api("/api/pipelines", {
      method: "POST",
      body: JSON.stringify({ name: fd.get("name"), stages }),
    });
    e.target.reset();
    await loadAll();
    toast("Pipeline creado");
  });

  $("#form-new-field").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api("/api/custom-fields", {
      method: "POST",
      body: JSON.stringify({
        name: fd.get("name"),
        field_type: fd.get("field_type"),
      }),
    });
    e.target.reset();
    await loadAll();
    toast("Campo agregado");
  });
}

bindEvents();
loadAll().then(() => {
  if (state.leads.length) selectLead(state.leads[0].id);
});
