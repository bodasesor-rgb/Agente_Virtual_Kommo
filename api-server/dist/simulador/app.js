const STORAGE_KEY = "bodasesor-kommo-sim-v3";
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

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function openMobileChat() {
  $("#inbox-panel")?.classList.add("open");
  $("#chat-overlay")?.classList.add("show");
}

function closeMobileChat() {
  $("#inbox-panel")?.classList.remove("open");
  $("#chat-overlay")?.classList.remove("show");
}

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
  const res = await fetch("/simulator/demo.json");
  if (!res.ok) throw new Error("No se pudo cargar demo.json");
  return res.json();
}

function isStoreValid(store) {
  return Boolean(
    store?.config?.pipelines?.length &&
      Array.isArray(store.leads) &&
      store.leads.length > 0 &&
      store.messages
  );
}

async function ensureStore() {
  let store = readStore();
  let loadedFresh = false;
  if (!isStoreValid(store)) {
    store = await loadDemoStore();
    writeStore(store);
    loadedFresh = true;
  }
  state.store = store;
  return { store, loadedFresh };
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
  const textEl = el.querySelector(".status-text") || el;
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("health");
    const status = await res.json();
    if (status.openai_configured) {
      textEl.textContent = "Lucy conectada · lista para chatear";
      el.classList.add("connected");
    } else {
      textEl.textContent = "Lucy online — falta OPEN_AI en Hostinger";
      el.classList.add("warning");
    }
  } catch {
    textEl.textContent = "Lucy no responde — revisa el deploy";
    el.classList.add("warning");
  }
}

async function loadAll() {
  const { store, loadedFresh } = await ensureStore();
  state.activePipelineId = store.config.pipelines[0]?.id;
  await loadAgentStatus();
  renderAll();
  if (store.leads.length) {
    const pick = store.leads[0];
    selectLead(pick.id);
    if (loadedFresh) {
      fetch("/api/kommo/simulator/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: pick.id }),
      }).catch(() => {});
    }
  } else {
    updateSendButton();
  }
}

function updateSendButton() {
  const btn = $("#btn-send");
  const lead = state.selectedLeadId ? getLead(state.selectedLeadId) : null;
  const ready = Boolean(lead);
  btn.disabled = !ready;
  btn.title = ready ? "Enviar mensaje a Lucy" : "Selecciona un lead en el embudo primero";
}

function renderAll() {
  $("#account-name").textContent = state.store.config.account_name;
  $("#pipeline-label").textContent = getPipeline()?.name || "Sin pipeline";
  $("#lead-count").textContent = `${state.store.leads.length} lead${state.store.leads.length === 1 ? "" : "s"}`;
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
      <div class="stage-color-bar" style="background:${stage.color}"></div>
      <div class="stage-header">
        <div class="stage-title">${escapeHtml(stage.name)}</div>
        <span class="stage-count">${leads.length}</span>
      </div>
    `;

    const dropZone = document.createElement("div");
    dropZone.className = "drop-zone";
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
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

  const isWa = lead.tags?.includes("whatsapp_business");
  const stageName = stageById(lead.stage_id)?.name || "";

  card.innerHTML = `
    <div class="lead-card-top">
      <div class="avatar-sm">${initials(lead.name)}</div>
      <h3>${escapeHtml(lead.name)}</h3>
    </div>
    <div class="lead-meta">
      ${isWa ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>' : ""}
      <span>${escapeHtml(lead.contact_phone || "Sin teléfono")}</span>
    </div>
    ${stageName ? `<span class="lead-tag">${escapeHtml(stageName)}</span>` : ""}
  `;

  card.addEventListener("click", () => {
    selectLead(lead.id);
    if (window.innerWidth <= 1024) openMobileChat();
  });
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
  $("#lead-subtitle").textContent = lead.contact_phone || lead.contact_email || "Sin contacto";
  $("#lead-avatar").textContent = initials(lead.name);

  const stage = stageById(lead.stage_id);
  const stageBadge = $("#lead-stage-badge");
  if (stage) {
    stageBadge.textContent = stage.name;
    stageBadge.classList.remove("hidden");
  } else {
    stageBadge.classList.add("hidden");
  }

  $("#btn-send").disabled = false;
  $("#btn-save-fields").disabled = false;
  updateSendButton();

  renderKanban();

  if (reloadMessages) {
    renderChat(listMessages(leadId));
  }

  renderFields(lead);
}

function renderChat(messages) {
  const body = $("#chat-body");
  body.innerHTML = "";
  if (!messages.length) {
    body.innerHTML = '<div class="empty-state">Sin mensajes aún.<br/>Escribe abajo para probar a Lucy.</div>';
    return;
  }
  for (const msg of messages) {
    const row = document.createElement("div");
    const isSystem = msg.direction === "system";
    row.className = `msg-row ${isSystem ? "system" : msg.direction}`;
    const avatarLabel = isSystem ? "!" : msg.direction === "incoming" ? initials(msg.author) : "L";
    row.innerHTML = `
      ${isSystem ? "" : `<div class="msg-avatar">${escapeHtml(avatarLabel)}</div>`}
      <div class="message ${isSystem ? "system" : msg.direction}">
        ${escapeHtml(msg.text).replace(/\n/g, "<br>")}
        <small>${escapeHtml(msg.author)} · ${formatTime(msg.created_at)}</small>
      </div>
    `;
    body.appendChild(row);
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
      .map((s) => `<span class="stage-tag" style="background:${s.color}">${escapeHtml(s.name)}</span>`)
      .join("");
    pipelineBox.innerHTML += `
      <div class="config-item">
        <strong>${escapeHtml(pipeline.name)}</strong>
        <div class="stage-tags">${stages}</div>
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
          <div class="activity-time">${formatTime(a.at)}</div>
          <div class="activity-detail">${escapeHtml(a.detail)}</div>
        </div>`
        )
        .join("")
    : '<div class="empty-state">Sin actividad registrada.</div>';
}

async function sendMessage() {
  const text = $("#chat-text").value.trim();
  if (!text) return;

  if (!state.selectedLeadId) {
    toast("Selecciona un lead en el embudo");
    return;
  }

  const lead = getLead(state.selectedLeadId);
  if (!lead) {
    toast("Lead no encontrado — pulsa «Restaurar demo»");
    return;
  }

  const author = lead.contact_phone || lead.name || "Cliente";
  $("#chat-text").value = "";
  $("#btn-send").disabled = true;
  $("#chat-typing").classList.remove("hidden");

  addMessage(state.selectedLeadId, "incoming", text, author);
  renderChat(listMessages(state.selectedLeadId));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch("/api/kommo/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        lead_id: lead.id,
        lead,
        message: { text, author },
      }),
    });

    const data = await res.json().catch(() => ({}));
    const reply =
      data.reply ||
      data.error ||
      (res.ok ? "Sin respuesta de Lucy" : `Error ${res.status} al contactar a Lucy`);

    if (data.status === "error" || /OPEN_AI|OPENAI/i.test(reply)) {
      toast(reply.slice(0, 180));
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
    const msg =
      err.name === "AbortError"
        ? "Lucy tardó más de 2 minutos. Intenta de nuevo."
        : err.message || "Error de red al hablar con Lucy";
    toast(msg);
    addMessage(state.selectedLeadId, "system", msg, "Sistema");
    selectLead(state.selectedLeadId);
  } finally {
    clearTimeout(timeoutId);
    $("#chat-typing").classList.add("hidden");
    updateSendButton();
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
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeView = btn.dataset.view;
      $("#view-pipeline").classList.toggle("hidden", state.activeView !== "pipeline");
      $("#view-config").classList.toggle("hidden", state.activeView !== "config");
      $("#view-activity").classList.toggle("hidden", state.activeView !== "activity");
      if (state.activeView === "activity") renderActivity();
    });
  });

  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeTab = btn.dataset.tab;
      $("#tab-chat").classList.toggle("hidden", state.activeTab !== "chat");
      $("#tab-fields").classList.toggle("hidden", state.activeTab !== "fields");
    });
  });

  const inbox = $("#inbox-panel");
  const overlay = $("#chat-overlay");

  $("#btn-toggle-chat")?.addEventListener("click", openMobileChat);
  overlay?.addEventListener("click", closeMobileChat);

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
    const leadIds = (readStore()?.leads || []).map((l) => l.id);
    localStorage.removeItem(STORAGE_KEY);
    state.selectedLeadId = null;
    await loadAll();
    for (const id of leadIds) {
      try {
        await fetch("/api/kommo/simulator/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: id }),
        });
      } catch {
        /* historial del servidor opcional */
      }
    }
    if (state.selectedLeadId) {
      await fetch("/api/kommo/simulator/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: state.selectedLeadId }),
      }).catch(() => {});
    }
    toast("Demo restaurada desde cero");
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
  const badge = $("#agent-badge");
  const textEl = badge?.querySelector(".status-text");
  if (textEl) textEl.textContent = "Error cargando simulador";
});
