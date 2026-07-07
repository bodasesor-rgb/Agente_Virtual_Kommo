const STORAGE_KEY = "bodasesor-kommo-sim-v1";
const STAGE_COLORS = ["#99ccff", "#b5e8b5", "#ffb3ba", "#d4b5ff", "#ffd666", "#c0c0c0"];

const state = {
  store: null,
  selectedLeadId: null,
  activePipelineId: null,
  activeView: "pipeline",
  activeTab: "chat",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function readStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  state.store = store;
}

function logActivity(store, type, detail) {
  store.activity_log = store.activity_log || [];
  store.activity_log.push({
    at: new Date().toISOString(),
    type,
    detail,
  });
}

async function loadDemoStore() {
  const res = await fetch("demo.json");
  if (!res.ok) throw new Error("No se pudo cargar demo.json");
  return res.json();
}

async function ensureStore() {
  let store = readStore();
  if (!store) {
    store = await loadDemoStore();
    writeStore(store);
  }
  state.store = store;
  return store;
}

function getPipeline() {
  return state.store.config.pipelines.find((p) => p.id === state.activePipelineId);
}

function stageById(stageId) {
  const pipeline = getPipeline();
  return pipeline?.stages.find((s) => s.id === stageId);
}

function getLead(leadId) {
  return state.store.leads.find((l) => l.id === leadId);
}

function listMessages(leadId) {
  return state.store.messages[String(leadId)] || [];
}

function addMessage(leadId, direction, text, author) {
  const id = state.store.next_message_id++;
  const message = {
    id,
    lead_id: leadId,
    direction,
    text,
    author,
    created_at: new Date().toISOString(),
  };
  const bucket = state.store.messages[String(leadId)] || [];
  bucket.push(message);
  state.store.messages[String(leadId)] = bucket;
  logActivity(state.store, "message", `[${direction}] ${author}: ${text.slice(0, 80)}`);
  writeStore(state.store);
  return message;
}

function updateLead(leadId, updates) {
  const idx = state.store.leads.findIndex((l) => l.id === leadId);
  if (idx === -1) return null;
  const current = state.store.leads[idx];
  const merged = { ...current, ...updates };
  if (updates.custom_fields) {
    merged.custom_fields = { ...current.custom_fields, ...updates.custom_fields };
  }
  if (updates.stage_id && updates.stage_id !== current.stage_id) {
    logActivity(state.store, "stage_moved", `Lead ${leadId} → ${updates.stage_id}`);
  }
  state.store.leads[idx] = merged;
  writeStore(state.store);
  return merged;
}

function applyLucyResponse(leadId, data) {
  const updates = {};
  const leadUpdates = data.lead_updates || {};
  for (const key of ["name", "contact_email", "contact_phone"]) {
    if (leadUpdates[key]) updates[key] = leadUpdates[key];
  }
  if (data.fields && typeof data.fields === "object") {
    updates.custom_fields = data.fields;
  }
  if (data.stage_id) updates.stage_id = data.stage_id;
  if (Object.keys(updates).length) updateLead(leadId, updates);
}

async function loadAgentStatus() {
  const el = $("#agent-badge");
  el.classList.remove("connected", "warning");
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("health");
    const status = await res.json();
    if (status.openai_configured) {
      el.textContent = "Lucy Hostinger · lista para chatear";
      el.classList.add("connected");
    } else {
      el.textContent = "Lucy online — falta OPEN_AI en Hostinger";
      el.classList.add("warning");
    }
  } catch {
    el.textContent = "Lucy no responde — revisa el deploy";
    el.classList.add("warning");
  }
}

async function loadAll() {
  await ensureStore();
  state.activePipelineId = state.store.config.pipelines[0]?.id;
  await loadAgentStatus();
  renderAll();
  if (state.store.leads.length && !state.selectedLeadId) {
    selectLead(state.store.leads[0].id);
  }
}

function renderAll() {
  $("#account-name").textContent = state.store.config.account_name;
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

    const leads = state.store.leads.filter(
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
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      col.style.outline = "none";
      const leadId = Number(e.dataTransfer.getData("text/lead-id"));
      moveLead(leadId, stage.id);
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

  const channel = lead.tags?.includes("whatsapp_business") ? "WhatsApp Business" : "Chat";

  card.innerHTML = `
    <h3>${escapeHtml(lead.name)}</h3>
    <div class="lead-meta">${channel} · ${escapeHtml(lead.contact_phone || "Sin teléfono")}</div>
    <div class="lead-meta">Resp: ${escapeHtml(lead.responsible)}</div>
  `;

  card.addEventListener("click", () => selectLead(lead.id));
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/lead-id", String(lead.id));
  });

  return card;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moveLead(leadId, stageId) {
  updateLead(leadId, { stage_id: stageId });
  renderKanban();
  toast("Lead movido de etapa");
}

function selectLead(leadId, reloadMessages = true) {
  state.selectedLeadId = leadId;
  const lead = getLead(leadId);
  if (!lead) return;

  $("#lead-title").textContent = lead.name;
  $("#lead-subtitle").textContent = `${lead.contact_phone} · ${stageById(lead.stage_id)?.name || lead.stage_id}`;
  $("#btn-send").disabled = false;
  $("#btn-save-fields").disabled = false;

  renderKanban();

  if (reloadMessages) {
    renderChat(listMessages(leadId));
  }

  renderFields(lead);
}

function renderChat(messages) {
  const body = $("#chat-body");
  body.innerHTML = "";
  for (const msg of messages) {
    const div = document.createElement("div");
    div.className = `message ${msg.direction}`;
    div.innerHTML = `${escapeHtml(msg.text)}<small>${escapeHtml(msg.author)} · ${new Date(msg.created_at).toLocaleString()}</small>`;
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

  for (const field of state.store.config.custom_fields) {
    const value = lead.custom_fields?.[field.id] ?? "";
    if (field.field_type === "select" && field.options?.length) {
      grid.innerHTML += fieldSelect(field, value);
    } else {
      grid.innerHTML += fieldInput(field.name, field.id, field.field_type, value, true);
    }
  }
}

function fieldInput(label, key, type, value, isCustom = false) {
  const inputType = type === "number" ? "number" : "text";
  return `
    <div class="field-row" data-key="${key}" data-custom="${isCustom}">
      <label>${escapeHtml(label)}</label>
      <input type="${inputType}" value="${escapeHtml(value ?? "")}" data-field="${key}" />
    </div>
  `;
}

function fieldSelect(field, value) {
  const options = field.options
    .map((opt) => `<option value="${escapeHtml(opt)}" ${opt === value ? "selected" : ""}>${escapeHtml(opt)}</option>`)
    .join("");
  return `
    <div class="field-row" data-key="${field.id}" data-custom="true">
      <label>${escapeHtml(field.name)}</label>
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

  for (const pipeline of state.store.config.pipelines) {
    const stages = [...pipeline.stages]
      .sort((a, b) => a.sort - b.sort)
      .map((s) => `<span style="background:${s.color}; padding:2px 8px; border-radius:6px; margin-right:6px;">${escapeHtml(s.name)}</span>`)
      .join("");
    pipelineBox.innerHTML += `
      <div class="config-item">
        <strong>${escapeHtml(pipeline.name)}</strong>
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">${stages}</div>
      </div>
    `;
  }

  const fieldsBox = $("#fields-config");
  fieldsBox.innerHTML = state.store.config.custom_fields
    .map(
      (f) => `
      <div class="config-item">
        <strong>${escapeHtml(f.name)}</strong>
        <div style="color:var(--muted); font-size:12px;">ID sim: ${f.id}${f.kommo_field_id ? ` · Kommo: ${f.kommo_field_id}` : ""} · Tipo: ${f.field_type}</div>
      </div>`
    )
    .join("");
}

function renderActivity() {
  const items = [...(state.store.activity_log || [])].reverse().slice(0, 50);
  $("#activity-list").innerHTML = items.length
    ? items
        .map(
          (a) => `
        <div class="activity-item">
          <div style="font-size:12px; color:var(--muted);">${new Date(a.at).toLocaleString()}</div>
          <div>${escapeHtml(a.detail)}</div>
        </div>`
        )
        .join("")
    : "<p style='padding:16px;'>Sin actividad aún.</p>";
}

async function sendMessage() {
  const text = $("#chat-text").value.trim();
  if (!text || !state.selectedLeadId) return;

  const lead = getLead(state.selectedLeadId);
  const author = lead?.name || "Cliente";
  $("#chat-text").value = "";
  $("#btn-send").disabled = true;
  $("#chat-typing").classList.remove("hidden");

  addMessage(state.selectedLeadId, "incoming", text, author);
  renderChat(listMessages(state.selectedLeadId));

  try {
    const res = await fetch("/api/kommo/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        lead_id: lead.id,
        lead,
        message: { text, author },
      }),
    });

    const data = await res.json().catch(() => ({}));
    const reply = data.reply || data.error || "Sin respuesta de Lucy";

    if (data.status === "error" || reply.startsWith("⚠️") || /OPEN_AI|OPENAI/i.test(reply)) {
      toast(reply.slice(0, 160));
    }

    addMessage(state.selectedLeadId, "outgoing", reply, "Lucy");
    applyLucyResponse(state.selectedLeadId, data);
    await loadAgentStatus();
    selectLead(state.selectedLeadId);

    if (data.all_fields_filled) {
      toast("Lucy: datos completos — lead listo para cotización");
    } else if (data.stage_id) {
      toast(`Lucy movió el lead a ${stageById(data.stage_id)?.name || data.stage_id}`);
    }
  } catch (err) {
    toast(err.message || "Error al enviar mensaje");
    selectLead(state.selectedLeadId);
  } finally {
    $("#chat-typing").classList.add("hidden");
    $("#btn-send").disabled = false;
  }
}

function saveFields() {
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

  updateLead(leadId, body);
  selectLead(leadId, false);
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

  $("#btn-new-lead").addEventListener("click", () => {
    const name = prompt("Nombre del lead:");
    if (!name) return;
    const pipeline = getPipeline();
    const stageId = [...pipeline.stages].sort((a, b) => a.sort - b.sort)[0].id;
    const leadId = state.store.next_lead_id++;
    const lead = {
      id: leadId,
      name,
      pipeline_id: pipeline.id,
      stage_id: stageId,
      contact_phone: "",
      contact_email: "",
      custom_fields: {},
      tags: ["whatsapp_business"],
      responsible: "Bodasesor",
    };
    state.store.leads.push(lead);
    state.store.messages[String(leadId)] = [];
    logActivity(state.store, "lead_created", `Lead ${name} creado en ${stageId}`);
    writeStore(state.store);
    renderKanban();
    toast("Lead creado");
  });

  $("#btn-reset").addEventListener("click", async () => {
    if (!confirm("¿Restaurar pipeline, campos y leads de demo?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state.selectedLeadId = null;
    await loadAll();
    toast("Demo restaurada");
  });

  $("#btn-export").addEventListener("click", () => {
    const data = {
      config: state.store.config,
      state: {
        next_lead_id: state.store.next_lead_id,
        next_message_id: state.store.next_message_id,
        leads: state.store.leads,
        messages: state.store.messages,
        activity_log: state.store.activity_log,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kommo-simulator-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#form-new-pipeline").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const stages = fd
      .get("stages")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name, i) => ({
        id: `stage_${Date.now()}_${i}`,
        name,
        color: STAGE_COLORS[i % STAGE_COLORS.length],
        sort: i,
        kommo_status_id: null,
      }));
    const pipeline = {
      id: `pipeline_${Date.now()}`,
      name: fd.get("name"),
      kommo_pipeline_id: null,
      stages,
    };
    state.store.config.pipelines.push(pipeline);
    state.activePipelineId = pipeline.id;
    writeStore(state.store);
    e.target.reset();
    renderAll();
    toast("Pipeline creado");
  });

  $("#form-new-field").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.store.config.custom_fields.push({
      id: `cf_${Date.now()}`,
      name: fd.get("name"),
      field_type: fd.get("field_type"),
      kommo_field_id: null,
    });
    writeStore(state.store);
    e.target.reset();
    renderAll();
    toast("Campo agregado");
  });
}

bindEvents();
loadAll().catch((err) => {
  toast(err.message || "Error al cargar el simulador");
  $("#agent-badge").textContent = "Error cargando simulador";
});
