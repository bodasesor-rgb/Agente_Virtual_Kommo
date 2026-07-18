const STORAGE_KEY = "bodasesor-kommo-sim-v6";
const DEMO_PACK_VERSION = 3;
const STAGE_COLORS = ["#99ccff", "#b5e8b5", "#ffb3ba", "#d4b5ff", "#ffd666", "#c0c0c0"];

const state = {
  store: null,
  selectedLeadId: null,
  activePipelineId: null,
  activeView: "pipeline",
  activeTab: "chat",
  autoRunning: false,
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
  const demo = await loadDemoStore();
  let store = readStore();
  let loadedFresh = false;
  let syncedAuto = false;

  if (!isStoreValid(store)) {
    store = demo;
    store.demo_pack_version = DEMO_PACK_VERSION;
    writeStore(store);
    loadedFresh = true;
  } else {
    syncedAuto = mergeAutoClientsFromDemo(store, demo);
    const packBump = (store.demo_pack_version ?? 0) < DEMO_PACK_VERSION;
    // Al subir de pack, sincronizar labels/IDs de custom_fields con Kommo (demo.json).
    const fieldsSynced = packBump ? syncCustomFieldsFromDemo(store, demo) : false;
    if (syncedAuto || packBump || fieldsSynced) {
      store.demo_pack_version = DEMO_PACK_VERSION;
      writeStore(store);
    }
  }

  state.store = store;
  return { store, loadedFresh, syncedAuto };
}

/** Alinea nombres/tipos/IDs Kommo del simulador con demo.json (UI idéntica a Kommo). */
function syncCustomFieldsFromDemo(store, demo) {
  const demoFields = demo?.config?.custom_fields;
  if (!Array.isArray(demoFields) || !demoFields.length) return false;
  const prev = JSON.stringify(store.config?.custom_fields ?? []);
  store.config = store.config || {};
  store.config.custom_fields = demoFields.map((f) => ({ ...f }));
  return JSON.stringify(store.config.custom_fields) !== prev;
}

function mergeAutoClientsFromDemo(store, demo) {
  const autoLeads = (demo.leads || []).filter((l) => l.auto_client_id || l.tags?.includes("auto_client"));
  if (!autoLeads.length) return false;

  let changed = false;
  store.messages = store.messages || {};

  for (const auto of autoLeads) {
    const existingIdx = store.leads.findIndex(
      (l) => l.id === auto.id || l.auto_client_id === auto.auto_client_id,
    );
    if (existingIdx === -1) {
      store.leads.push({ ...auto });
      store.messages[String(auto.id)] = store.messages[String(auto.id)] || [];
      changed = true;
    } else {
      const cur = store.leads[existingIdx];
      const merged = {
        ...cur,
        name: auto.name,
        contact_phone: auto.contact_phone,
        tags: [...new Set([...(cur.tags || []), ...(auto.tags || [])])],
        auto_client_id: auto.auto_client_id,
        auto_client_slug: auto.auto_client_slug,
      };
      if (JSON.stringify(merged) !== JSON.stringify(cur)) {
        store.leads[existingIdx] = merged;
        changed = true;
      }
    }
  }

  if ((demo.next_lead_id ?? 0) > (store.next_lead_id ?? 0)) {
    store.next_lead_id = demo.next_lead_id;
    changed = true;
  }

  return changed;
}

function listAutoClientLeads() {
  return (state.store?.leads || []).filter((l) => l.auto_client_id || l.tags?.includes("auto_client"));
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
  const { store, loadedFresh, syncedAuto } = await ensureStore();
  state.activePipelineId = store.config.pipelines[0]?.id;
  await loadAgentStatus();
  renderAll();
  if (syncedAuto) {
    toast("Se agregaron los 10 clientes automáticos al embudo");
  }
  const autoLeads = listAutoClientLeads();
  const pick = autoLeads[0] || store.leads[0];
  if (pick) {
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
  const autoCount = listAutoClientLeads().length;
  const total = state.store.leads.length;
  $("#lead-count").textContent =
    autoCount > 0 ? `${total} leads · ${autoCount} auto` : `${total} lead${total === 1 ? "" : "s"}`;
  renderKanban();
  renderAutoClients();
  renderConfig();
  renderActivity();
  if (state.selectedLeadId) selectLead(state.selectedLeadId, false);
}

function renderAutoClients() {
  const box = $("#auto-clients-list");
  if (!box) return;
  const leads = listAutoClientLeads().sort((a, b) => (a.auto_client_id ?? 0) - (b.auto_client_id ?? 0));
  if (!leads.length) {
    box.innerHTML =
      '<div class="empty-state">No hay clientes auto cargados.<br/><button class="btn btn-secondary btn-sm" type="button" id="btn-sync-auto-inline">Cargar 10 clientes</button></div>';
    $("#btn-sync-auto-inline")?.addEventListener("click", syncAutoClientsNow, { once: true });
    return;
  }
  box.innerHTML = leads
    .map(
      (lead) => `
    <div class="auto-client-card" data-lead-id="${lead.id}">
      <div class="auto-client-head">
        <strong>${escapeHtml(lead.name)}</strong>
        <span class="lead-tag lead-tag-auto">#${lead.auto_client_id ?? "?"}</span>
      </div>
      <p class="auto-client-phone">${escapeHtml(lead.contact_phone || "")}</p>
      <div class="auto-client-actions">
        <button class="btn btn-ghost btn-sm btn-open-auto" type="button" data-lead-id="${lead.id}">Abrir chat</button>
        <button class="btn btn-primary btn-sm btn-run-auto" type="button" data-lead-id="${lead.id}">Ejecutar</button>
      </div>
    </div>`,
    )
    .join("");

  box.querySelectorAll(".btn-open-auto").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.leadId);
      state.activeView = "pipeline";
      $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === "pipeline"));
      $("#view-pipeline")?.classList.remove("hidden");
      $("#view-auto-clients")?.classList.add("hidden");
      $("#view-config")?.classList.add("hidden");
      $("#view-activity")?.classList.add("hidden");
      selectLead(id);
      if (window.innerWidth <= 1024) openMobileChat();
    });
  });

  box.querySelectorAll(".btn-run-auto").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lead = getLead(Number(btn.dataset.leadId));
      if (lead) runAutoClientForLead(lead);
    });
  });
}

async function syncAutoClientsNow() {
  const demo = await loadDemoStore();
  const changed = mergeAutoClientsFromDemo(state.store, demo);
  if (changed) {
    state.store.demo_pack_version = DEMO_PACK_VERSION;
    writeStore(state.store);
    logActivity(state.store, "auto_sync", "Clientes automáticos sincronizados desde demo.json");
  }
  renderAll();
  toast(changed ? "10 clientes auto agregados" : "Los clientes auto ya estaban cargados");
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
  const isAuto = lead.tags?.includes("auto_client") || lead.auto_client_id;
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
    ${isAuto ? '<span class="lead-tag lead-tag-auto">Auto LLM</span>' : ""}
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
  updateAutoClientButton(lead);

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
    const label = field.kommo_field_id
      ? `${field.name} <span class="field-kommo-id">· ID ${field.kommo_field_id}</span>`
      : field.name;
    if (field.field_type === "select" && field.options?.length) {
      grid.innerHTML += fieldSelect({ ...field, name: label }, value);
    } else {
      grid.innerHTML += fieldInput(label, field.id, field.field_type, value, true, true);
    }
  }

  // Memoria CRM interna (etiquetas Lucy = las que usa el embudo / PATCH real).
  const snap = lead.custom_fields?.cf_crm_snapshot;
  if (typeof snap === "string" && snap.trim()) {
    grid.innerHTML += `
      <div class="field-row field-row-wide" data-key="cf_crm_snapshot" data-custom="true">
        <label>Memoria CRM (Lucy / mismo criterio que Kommo)</label>
        <textarea readonly rows="8" data-field="cf_crm_snapshot">${escapeHtml(snap)}</textarea>
      </div>
    `;
  }
}

function fieldInput(label, key, type, value, isCustom = false, allowHtmlLabel = false) {
  const labelHtml = allowHtmlLabel ? label : escapeHtml(label);
  if (type === "textarea") {
    return `
    <div class="field-row field-row-wide" data-key="${key}" data-custom="${isCustom}">
      <label>${labelHtml}</label>
      <textarea rows="4" data-field="${key}">${escapeHtml(value ?? "")}</textarea>
    </div>
  `;
  }
  const inputType = type === "number" ? "number" : "text";
  return `
    <div class="field-row" data-key="${key}" data-custom="${isCustom}">
      <label>${labelHtml}</label>
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

function updateAutoClientButton(lead) {
  const btn = $("#btn-auto-client");
  if (!btn) return;
  const isAuto = lead?.tags?.includes("auto_client") || lead?.auto_client_id;
  btn.classList.toggle("hidden", !isAuto);
  btn.disabled = state.autoRunning;
}

function getAutoClientIdForLead(lead) {
  return lead?.auto_client_id ?? lead?.id;
}

async function resetLeadHistory(leadId) {
  await fetch("/api/kommo/simulator/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  }).catch(() => {});
}

function clearLeadMessages(leadId) {
  state.store.messages[String(leadId)] = [];
  writeStore(state.store);
}

async function runAutoClientForLead(lead) {
  const clientId = getAutoClientIdForLead(lead);
  if (!clientId) {
    toast("Este lead no tiene perfil auto-cliente");
    return;
  }

  if (
    !confirm(
      `¿Ejecutar conversación automática con ${lead.name}?\n\nUn LLM adoptará su perfil y charlará con Lucy (~15 turnos, 2-5 min).`,
    )
  ) {
    return;
  }

  state.autoRunning = true;
  $("#btn-send").disabled = true;
  $("#btn-auto-client").disabled = true;
  const typingEl = $("#chat-typing");
  typingEl.classList.remove("hidden");
  typingEl.textContent = "";
  typingEl.innerHTML =
    '<span class="typing-dots"><span></span><span></span><span></span></span> Auto-cliente conversando con Lucy…';

  selectLead(lead.id);
  await resetLeadHistory(lead.id);
  clearLeadMessages(lead.id);
  renderChat([]);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000);

  try {
    const res = await fetch("/api/kommo/simulator/auto-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ client_id: clientId, lead_id: lead.id }),
    });
    const data = await res.json().catch(() => ({}));

    if (data.status === "error" || !res.ok) {
      throw new Error(data.error || data.reply || `Error ${res.status}`);
    }

    const author = lead.contact_phone || lead.name;
    for (const turn of data.transcript || []) {
      addMessage(lead.id, "incoming", turn.user, author);
      addMessage(lead.id, "outgoing", turn.reply, "Lucy");
    }

    if (data.run?.lastData) {
      applyLucyResponse(lead.id, data.run.lastData);
    }

    const verdict = data.pass ? "PASA" : "FALLA";
    const tipo = data.failureType ? ` (${data.failureType})` : "";
    addMessage(
      lead.id,
      "system",
      `Juez: ${verdict}${tipo} — ${data.reason || "Sin detalle"}`,
      "QA",
    );
    logActivity(state.store, "auto_client", `${lead.name}: ${verdict} — ${(data.reason || "").slice(0, 120)}`);
    writeStore(state.store);

    selectLead(lead.id);
    toast(`${lead.name}: ${verdict}`);
  } catch (err) {
    const msg =
      err.name === "AbortError"
        ? "Auto-cliente tardó más de 10 minutos."
        : err.message || "Error al ejecutar auto-cliente";
    toast(msg);
    addMessage(lead.id, "system", msg, "Sistema");
    selectLead(lead.id);
  } finally {
    clearTimeout(timeoutId);
    state.autoRunning = false;
    $("#chat-typing").classList.add("hidden");
    const typingEl = $("#chat-typing");
    if (typingEl) typingEl.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span> Lucy está escribiendo…';
    updateSendButton();
    updateAutoClientButton(getLead(lead.id));
  }
}

async function runAllAutoClients() {
  if (
    !confirm(
      "¿Ejecutar los 10 clientes automáticos?\n\nPuede tardar 20-40 minutos. El reporte aparecerá al terminar.",
    )
  ) {
    return;
  }

  state.autoRunning = true;
  $("#btn-auto-all").disabled = true;
  toast("Iniciando batería de 10 clientes…");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3600000);

  try {
    const res = await fetch("/api/kommo/simulator/auto-clients/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));

    if (data.status === "error" || !res.ok) {
      throw new Error(data.error || `Error ${res.status}`);
    }

    for (const result of data.results || []) {
      const lead = state.store.leads.find((l) => l.auto_client_id === result.client?.id);
      if (!lead) continue;
      await resetLeadHistory(lead.id);
      clearLeadMessages(lead.id);
      const author = lead.contact_phone || lead.name;
      for (const turn of result.transcript || []) {
        addMessage(lead.id, "incoming", turn.user, author);
        addMessage(lead.id, "outgoing", turn.reply, "Lucy");
      }
      if (result.run?.lastData) applyLucyResponse(lead.id, result.run.lastData);
      addMessage(
        lead.id,
        "system",
        `Juez: ${result.pass ? "PASA" : "FALLA"}${result.failureType ? ` (${result.failureType})` : ""} — ${result.reason || ""}`,
        "QA",
      );
    }
    writeStore(state.store);
    renderKanban();
    toast(`Batería: ${data.passed}/${data.total} PASA`);
    alert(`Resultado global: ${data.passed}/${data.total} PASA\n\nRevisa cada lead auto para el detalle.`);
  } catch (err) {
    toast(err.name === "AbortError" ? "Batería cancelada por tiempo." : err.message);
  } finally {
    clearTimeout(timeoutId);
    state.autoRunning = false;
    $("#btn-auto-all").disabled = false;
  }
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
    const input = row.querySelector("input, select, textarea");
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
      $("#view-auto-clients").classList.toggle("hidden", state.activeView !== "auto-clients");
      $("#view-config").classList.toggle("hidden", state.activeView !== "config");
      $("#view-activity").classList.toggle("hidden", state.activeView !== "activity");
      if (state.activeView === "activity") renderActivity();
      if (state.activeView === "auto-clients") renderAutoClients();
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
  $("#btn-auto-client")?.addEventListener("click", () => {
    const lead = state.selectedLeadId ? getLead(state.selectedLeadId) : null;
    if (lead) runAutoClientForLead(lead);
  });
  $("#btn-auto-all")?.addEventListener("click", runAllAutoClients);
  $("#btn-auto-all-panel")?.addEventListener("click", runAllAutoClients);
  $("#btn-sync-auto")?.addEventListener("click", syncAutoClientsNow);
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
