const API = "/api";

const sectionIntro = document.getElementById("section-intro");
const statsRow = document.getElementById("stats-row");
const gapsList = document.getElementById("gaps-list");
const emptyState = document.getElementById("empty-state");
const syncStatus = document.getElementById("sync-status");
const systemErrorsBox = document.getElementById("system-errors");
const systemErrorsTitle = document.getElementById("system-errors-title");
const systemErrorsSummary = document.getElementById("system-errors-summary");
const systemErrorsList = document.getElementById("system-errors-list");
const systemErrorsChecked = document.getElementById("system-errors-checked");
const btnRetryErrors = document.getElementById("btn-retry-errors");
const btnSyncNow = document.getElementById("btn-sync-now");
const viewTabs = document.getElementById("view-tabs");
const infoPanel = document.getElementById("info-panel");

/** @type {"chats" | "gaps" | "info"} */
let currentMode = "chats";
/** @type {string} */
let currentStatus = "approved";
let lastLoadError = null;
let lastChatStats = { pending: 0, approved: 0, rejected: 0, trainingExamples: 0 };
let lastGapStats = { pending: 0, answered: 0, dismissed: 0 };
let lastInfoStats = { catalog: 0, tips: 0, total: 0 };

/** Estado temporal del extractor PDF en la pestaña info */
let pendingPdf = {
  kind: "catalog",
  filename: "",
  text: "",
  pages: 0,
};

const ERROR_HINTS = {
  unauthorized:
    "El servidor bloqueó esta API. Suele pasar si Hostinger no tiene el último deploy — revisa Panel → Estado o redeploy en hPanel.",
  failed_to_load_gaps:
    "No se pudo leer la base de datos de aprendizaje. Pulsa «Revisar de nuevo»; si persiste, reinicia Lucy en Hostinger.",
  failed_to_load_stats: "No se pudieron cargar las estadísticas de aprendizaje.",
  not_json: "El servidor respondió HTML en lugar de JSON (503 o página de error de Hostinger).",
  network: "No hay conexión con el servidor. Comprueba que Lucy esté en línea.",
};

function friendlyError(code, fallback) {
  if (!code) return fallback || "Error desconocido";
  const lower = String(code).toLowerCase();
  if (lower === "unauthorized") return "Sin autorización (unauthorized)";
  if (lower.startsWith("http ")) return `Error del servidor (${code})`;
  return ERROR_HINTS[lower] ? ERROR_HINTS[lower] : fallback || String(code);
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, status: res.status, error: "not_json", preview: text.slice(0, 120) };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}`, data };
  }
  return { ok: true, status: res.status, data };
}

function diagItem({ id, label, status, detail, fix, resolved }) {
  const icon = status === "ok" ? "✓" : status === "warn" ? "!" : "✕";
  const statusLabel = resolved ? "Resuelto" : status === "warn" ? "Revisar" : "Pendiente";
  const statusClass = resolved ? "resolved" : status === "warn" ? "watch" : "pending";
  return `
    <li class="system-error-item ${status}" data-check="${escapeHtml(id)}">
      <span class="system-error-icon" aria-hidden="true">${icon}</span>
      <div class="system-error-body">
        <strong>${escapeHtml(label)}</strong>
        <p>${escapeHtml(detail)}</p>
        ${fix ? `<p class="system-error-fix">${escapeHtml(fix)}</p>` : ""}
      </div>
      <span class="system-error-status ${statusClass}">${statusLabel}</span>
    </li>
  `;
}

async function loadSystemDiagnostics() {
  const items = [];
  const checkedAt = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });

  let health = { ok: false, error: "network" };
  try {
    health = await fetchJson("/health");
  } catch (err) {
    health = { ok: false, error: err instanceof Error ? err.message : "network" };
  }

  if (!health.ok) {
    items.push({
      id: "server",
      label: "Servidor Lucy",
      status: "error",
      resolved: false,
      detail: friendlyError(health.error, "No se pudo conectar con Lucy"),
      fix: "hPanel → Node.js → Reiniciar o Redesplegar desde main.",
    });
  } else {
    const h = health.data;
    items.push({
      id: "server",
      label: "Servidor Lucy",
      status: "ok",
      resolved: true,
      detail: `En línea · prompt ${h.lucy_prompt ?? "?"} · ${h.built_at_display ?? "sin fecha de build"}`,
    });
  }

  const chatStats = await fetchJson("/aprendizaje/from-chats/stats");
  if (!chatStats.ok) {
    items.push({
      id: "chat_learning",
      label: "Aprendizaje de chats",
      status: "error",
      resolved: false,
      detail: friendlyError(chatStats.error, "No se pudo leer /api/aprendizaje/from-chats/stats"),
      fix: "Redeploy a main con el fix V8.6 del panel de aprendizaje.",
    });
  } else {
    const s = chatStats.data;
    const learned = (s.approved ?? 0) + (s.trainingExamples ?? 0);
    items.push({
      id: "chat_learning",
      label: "Aprendizaje de chats",
      status: learned > 0 || (s.pending ?? 0) > 0 ? "ok" : "warn",
      resolved: learned > 0,
      detail:
        learned > 0
          ? `${s.approved ?? 0} aprobados · ${s.pending ?? 0} por revisar · ${s.trainingExamples ?? 0} en entrenamiento.`
          : "Aún no hay pares aprendidos de chats. Usa «Sincronizar chats ahora» tras mover leads a Humano Trabaja.",
      fix:
        learned > 0
          ? null
          : "El cron corre cada 5 min. Si sigue en 0, confirma que Alejandro ya escribió en esos chats.",
    });
  }

  const gaps = await fetchJson("/knowledge-gaps/stats");
  if (!gaps.ok) {
    items.push({
      id: "gaps_api",
      label: "Huecos de catálogo",
      status: "error",
      resolved: false,
      detail: friendlyError(gaps.error, "No se pudo leer knowledge-gaps"),
    });
  } else {
    items.push({
      id: "gaps_api",
      label: "Huecos de catálogo",
      status: "ok",
      resolved: true,
      detail: `${gaps.data.pending ?? 0} pendientes · ${gaps.data.answered ?? 0} enseñadas.`,
    });
  }

  const info = await fetchJson("/lucy-info/stats");
  if (!info.ok) {
    items.push({
      id: "lucy_info",
      label: "Información para Lucy",
      status: "error",
      resolved: false,
      detail: friendlyError(info.error, "No se pudo leer /api/lucy-info"),
      fix: "Redeploy a main con V8.37 (pestaña Información para Lucy).",
    });
  } else {
    items.push({
      id: "lucy_info",
      label: "Información para Lucy",
      status: "ok",
      resolved: true,
      detail: `${info.data.catalog ?? 0} catálogos/PDF · ${info.data.tips ?? 0} notas de tendencias.`,
    });
  }

  const errors = items.filter((i) => i.status === "error").length;
  const warns = items.filter((i) => i.status === "warn").length;
  const allOk = errors === 0 && warns === 0;

  systemErrorsBox.classList.remove("hidden", "all-ok", "has-errors", "has-warns");
  if (allOk) {
    systemErrorsBox.classList.add("all-ok");
    systemErrorsTitle.textContent = "Sin errores detectados";
    systemErrorsSummary.textContent =
      "Panel, chats y catálogo responden. Lucy puede aprender de Alejandro y de lo que enseñas aquí.";
  } else if (errors > 0) {
    systemErrorsBox.classList.add("has-errors");
    systemErrorsTitle.textContent = errors === 1 ? "1 error activo" : `${errors} errores activos`;
    systemErrorsSummary.textContent = "Hay problemas que impiden ver o guardar aprendizajes.";
  } else {
    systemErrorsBox.classList.add("has-warns");
    systemErrorsTitle.textContent = "Avisos — sin bloqueo grave";
    systemErrorsSummary.textContent =
      "El sistema responde, pero todavía no hay aprendizajes de chats. Sincroniza o espera a que Alejandro atienda.";
  }

  systemErrorsList.innerHTML = items.map(diagItem).join("");
  systemErrorsChecked.textContent = `Última revisión: ${checkedAt}`;
}

const INTRO = {
  chats_approved:
    "Pares que Lucy <strong>ya usa</strong> al responder: salieron de chats reales donde Alejandro atendió al cliente (auto-aprobados o revisados).",
  chats_pending:
    "Candidatos nuevos extraídos de chats en <strong>Humano Trabaja / Cotización</strong>. Los de alta confianza se aprueban solos; el resto espera revisión en Lucy Admin.",
  gaps_pending:
    "Preguntas donde <strong>Lucy no encontró precio/servicio en el Sheet</strong>. Escribe la respuesta correcta y Lucy la usará después.",
  gaps_answered:
    "Respuestas que <strong>tú le enseñaste</strong> sobre huecos del catálogo.",
  info:
    "Sube <strong>PDFs de catálogos/servicios</strong> (se convierten a texto plano para que Lucy los lea) y escribe <strong>tendencias, modas y consejos</strong> para que ofrezca con más naturalidad. Los precios del Sheet siguen mandando.",
};

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function gapTypeLabel(type) {
  const map = { price: "Precio", inclusion: "Inclusión", service: "Servicio", unknown: "General" };
  return map[type] || type;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateTabCounts() {
  const map = {
    chatLearned: lastChatStats.approved + (lastChatStats.trainingExamples || 0),
    gapPending: lastGapStats.pending,
    infoTotal: lastInfoStats.total || 0,
    approved: currentMode === "chats" ? lastChatStats.approved : lastGapStats.answered,
    pending: currentMode === "chats" ? lastChatStats.pending : lastGapStats.pending,
  };
  document.querySelectorAll("[data-count]").forEach((el) => {
    const key = el.dataset.count;
    if (key && map[key] !== undefined) el.textContent = String(map[key]);
  });
}

function syncStatusTabsForMode() {
  if (!viewTabs) return;

  if (currentMode === "info") {
    viewTabs.classList.add("hidden");
    return;
  }
  viewTabs.classList.remove("hidden");

  const tabs = viewTabs.querySelectorAll(".view-tab");
  // Tabs fijos: data-status = approved | pending (chats) o answered|pending via mapping
  tabs.forEach((btn) => {
    const key = btn.dataset.statusKey || btn.dataset.status;
    if (!btn.dataset.statusKey) btn.dataset.statusKey = key;
    const title = btn.querySelector(".tab-title");
    const desc = btn.querySelector(".tab-desc");
    if (currentMode === "chats") {
      btn.dataset.status = btn.dataset.statusKey; // approved | pending
      if (btn.dataset.statusKey === "approved") {
        title.textContent = "Ya aprendió";
        desc.textContent = "En uso por Lucy";
      } else {
        title.textContent = "Por revisar";
        desc.textContent = "Candidatos nuevos";
      }
    } else {
      btn.dataset.status = btn.dataset.statusKey === "approved" ? "answered" : "pending";
      if (btn.dataset.statusKey === "approved") {
        title.textContent = "Ya aprendió";
        desc.textContent = "Enseñadas por ti";
      } else {
        title.textContent = "No sabe";
        desc.textContent = "Huecos del Sheet";
      }
    }
  });

  if (currentMode === "chats" && (currentStatus === "answered" || !currentStatus)) {
    currentStatus = "approved";
  }
  if (currentMode === "gaps" && currentStatus === "approved") {
    currentStatus = "answered";
  }

  tabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.status === currentStatus);
  });
}

async function loadStats() {
  const [chatRes, gapRes, infoRes] = await Promise.all([
    fetchJson("/aprendizaje/from-chats/stats"),
    fetchJson("/knowledge-gaps/stats"),
    fetchJson("/lucy-info/stats"),
  ]);

  if (chatRes.ok) lastChatStats = chatRes.data;
  if (gapRes.ok) lastGapStats = gapRes.data;
  if (infoRes.ok) lastInfoStats = infoRes.data;

  if (!chatRes.ok && !gapRes.ok && !infoRes.ok) {
    lastLoadError = chatRes.error || gapRes.error || infoRes.error;
    throw new Error(lastLoadError);
  }
  lastLoadError = null;

  const chatLearned = (lastChatStats.approved ?? 0) + (lastChatStats.trainingExamples ?? 0);

  statsRow.innerHTML = `
    <div class="stat-card learned">
      <strong>${chatLearned}</strong>
      <span>Aprendido de chats</span>
    </div>
    <div class="stat-card pending">
      <strong>${lastChatStats.pending ?? 0}</strong>
      <span>Chats por revisar</span>
    </div>
    <div class="stat-card total">
      <strong>${lastGapStats.answered ?? 0}</strong>
      <span>Huecos enseñados</span>
    </div>
    <div class="stat-card dismissed">
      <strong>${lastInfoStats.total ?? 0}</strong>
      <span>Docs / tips para Lucy</span>
    </div>
  `;

  updateTabCounts();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function renderInfoDocCard(doc) {
  const card = document.createElement("article");
  card.className = "gap-card learned-card info-doc-card";
  card.dataset.id = doc.id;
  const kindLabel = doc.kind === "tips" ? "Tendencias / consejos" : "Catálogo / servicio";
  card.innerHTML = `
    <div class="gap-top">
      <div>
        <div class="gap-topic">${escapeHtml(doc.title)}</div>
        <div class="info-meta">${escapeHtml(kindLabel)}${
          doc.sourceFilename ? ` · ${escapeHtml(doc.sourceFilename)}` : ""
        } · ${doc.charCount ?? doc.content?.length ?? 0} caracteres</div>
      </div>
      <div class="gap-badges">
        <span class="gap-badge learned">${doc.kind === "tips" ? "Consejos" : "Catálogo"}</span>
      </div>
    </div>
    <div class="info-block answer">
      <div class="label">Texto que Lucy puede leer</div>
      <pre class="info-preview">${escapeHtml((doc.content || "").slice(0, 900))}${
        (doc.content || "").length > 900 ? "…" : ""
      }</pre>
    </div>
    <details class="info-edit">
      <summary>Editar texto</summary>
      <label>Título
        <input type="text" class="info-title-input" value="${escapeHtml(doc.title)}" />
      </label>
      <label>Contenido (texto plano)
        <textarea class="answer-box info-content-input">${escapeHtml(doc.content || "")}</textarea>
      </label>
      <div class="gap-actions">
        <button type="button" class="btn-save info-save-btn">Guardar cambios</button>
        <button type="button" class="btn-ghost info-delete-btn">Eliminar</button>
      </div>
    </details>
    <div class="gap-footer">
      <span>Actualizado ${formatDate(doc.updatedAt)}</span>
    </div>
  `;
  card.querySelector(".info-save-btn")?.addEventListener("click", () => saveInfoDoc(doc.id, card));
  card.querySelector(".info-delete-btn")?.addEventListener("click", () => deleteInfoDoc(doc.id));
  return card;
}

async function saveInfoDoc(id, card) {
  const title = card.querySelector(".info-title-input")?.value?.trim();
  const content = card.querySelector(".info-content-input")?.value?.trim();
  if (!title || !content) {
    alert("Título y contenido son obligatorios.");
    return;
  }
  const btn = card.querySelector(".info-save-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Guardando…";
  }
  try {
    await api(`/lucy-info/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title, content }),
    });
    await refresh();
  } catch (err) {
    alert(err.message || "Error al guardar");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Guardar cambios";
    }
  }
}

async function deleteInfoDoc(id) {
  if (!confirm("¿Eliminar esta información? Lucy dejará de usarla.")) return;
  await api(`/lucy-info/documents/${id}`, { method: "DELETE" });
  await refresh();
}

async function extractPdfFromInput(fileInput, statusEl, previewEl) {
  const file = fileInput?.files?.[0];
  if (!file) {
    alert("Elige un PDF primero.");
    return null;
  }
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    alert("Solo se aceptan archivos PDF.");
    return null;
  }
  if (statusEl) statusEl.textContent = "Extrayendo texto del PDF…";
  try {
    const pdfBase64 = await fileToBase64(file);
    const res = await fetchJson("/lucy-info/extract-pdf", {
      method: "POST",
      body: JSON.stringify({ pdfBase64, filename: file.name }),
    });
    if (!res.ok) throw new Error(res.error || "extract_failed");
    pendingPdf = {
      kind: pendingPdf.kind,
      filename: file.name,
      text: res.data.text || "",
      pages: res.data.pages || 0,
    };
    if (previewEl) previewEl.value = pendingPdf.text;
    if (statusEl) {
      statusEl.textContent = `Listo: ${pendingPdf.pages} página(s) · ${pendingPdf.text.length} caracteres. Revisa el texto y guarda.`;
    }
    return pendingPdf;
  } catch (err) {
    if (statusEl) statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    return null;
  }
}

async function saveInfoFromForm(kind) {
  const titleEl = document.getElementById(`info-title-${kind}`);
  const contentEl = document.getElementById(`info-content-${kind}`);
  const statusEl = document.getElementById(`info-status-${kind}`);
  const title = titleEl?.value?.trim() || "";
  const content = contentEl?.value?.trim() || "";
  if (!content) {
    alert(kind === "tips" ? "Escribe las tendencias o consejos." : "Sube un PDF o pega el texto del catálogo.");
    return;
  }
  if (statusEl) statusEl.textContent = "Guardando para Lucy…";
  try {
    await api("/lucy-info/documents", {
      method: "POST",
      body: JSON.stringify({
        kind,
        title: title || (kind === "tips" ? "Tendencias y consejos" : pendingPdf.filename || "Catálogo"),
        content,
        sourceFilename: kind === "catalog" ? pendingPdf.filename || null : null,
      }),
    });
    if (titleEl) titleEl.value = "";
    if (contentEl) contentEl.value = "";
    pendingPdf = { kind: "catalog", filename: "", text: "", pages: 0 };
    const fileInput = document.getElementById("info-pdf-input");
    if (fileInput) fileInput.value = "";
    if (statusEl) statusEl.textContent = "Guardado. Lucy ya puede usar este texto en las siguientes conversaciones.";
    await refresh();
  } catch (err) {
    if (statusEl) statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function renderInfoPanelShell() {
  if (!infoPanel) return;
  infoPanel.classList.remove("hidden");
  infoPanel.innerHTML = `
    <div class="info-grid-panels">
      <section class="info-upload-card">
        <p class="eyebrow">Catálogos y servicios</p>
        <h3>Subir PDF → texto plano</h3>
        <p class="info-help">Lucy no lee el PDF como imagen: lo convertimos a texto para que conozca menús, inclusiones y detalle de servicios.</p>
        <label>Título (opcional)
          <input type="text" id="info-title-catalog" placeholder="Ej. Coffee Break — niveles e inclusiones" />
        </label>
        <label class="file-label">PDF del catálogo
          <input type="file" id="info-pdf-input" accept="application/pdf,.pdf" />
        </label>
        <div class="gap-actions">
          <button type="button" class="btn-ghost" id="btn-extract-pdf">Extraer texto del PDF</button>
        </div>
        <label>Texto plano (editable)
          <textarea id="info-content-catalog" class="answer-box info-textarea" placeholder="Aquí aparecerá el texto extraído. También puedes pegarlo a mano…"></textarea>
        </label>
        <div class="gap-actions">
          <button type="button" class="btn-save" id="btn-save-catalog">Guardar catálogo para Lucy</button>
        </div>
        <p id="info-status-catalog" class="info-status"></p>
      </section>

      <section class="info-upload-card tips-card">
        <p class="eyebrow">Tendencias y consejos</p>
        <h3>Lo que Lucy puede ofrecer con naturalidad</h3>
        <p class="info-help">Modas de bodas, tipologías de eventos corporativos, ideas de montaje, temporada, etc. Lucy usará esto para aconsejar sin inventar precios.</p>
        <label>Título (opcional)
          <input type="text" id="info-title-tips" placeholder="Ej. Tendencias 2026 — bodas íntimas" />
        </label>
        <label>Notas para Lucy
          <textarea id="info-content-tips" class="answer-box info-textarea" placeholder="Escribe tendencias, modas o consejos que quieras que Lucy use al conversar…"></textarea>
        </label>
        <div class="gap-actions">
          <button type="button" class="btn-save" id="btn-save-tips">Guardar consejos para Lucy</button>
        </div>
        <p id="info-status-tips" class="info-status"></p>
      </section>
    </div>
    <div class="info-docs-head">
      <h3>Ya cargado para Lucy</h3>
      <p class="info-help">Se inyecta en el prompt (con límite de caracteres). Prioridad de precios: Google Sheet.</p>
    </div>
    <div id="info-docs-list" class="gaps-list"></div>
  `;

  document.getElementById("btn-extract-pdf")?.addEventListener("click", async () => {
    pendingPdf.kind = "catalog";
    await extractPdfFromInput(
      document.getElementById("info-pdf-input"),
      document.getElementById("info-status-catalog"),
      document.getElementById("info-content-catalog"),
    );
  });
  document.getElementById("btn-save-catalog")?.addEventListener("click", () => saveInfoFromForm("catalog"));
  document.getElementById("btn-save-tips")?.addEventListener("click", () => saveInfoFromForm("tips"));
}

async function loadInfoMode() {
  sectionIntro.innerHTML = INTRO.info;
  gapsList.innerHTML = "";
  emptyState.classList.add("hidden");
  renderInfoPanelShell();

  const listEl = document.getElementById("info-docs-list");
  try {
    const data = await api("/lucy-info?limit=50");
    lastLoadError = null;
    if (!data.documents?.length) {
      if (listEl) {
        listEl.innerHTML =
          `<p class="empty-inline">Aún no hay documentos. Sube un PDF de catálogo o escribe tendencias arriba.</p>`;
      }
      return;
    }
    if (listEl) {
      listEl.innerHTML = "";
      for (const doc of data.documents) listEl.appendChild(renderInfoDocCard(doc));
    }
  } catch (err) {
    lastLoadError = err instanceof Error ? err.message : String(err);
    if (listEl) {
      listEl.innerHTML = `<p class="empty-inline"><strong>No se pudo cargar</strong> ${escapeHtml(lastLoadError)}</p>`;
    }
    throw err;
  }
}

function renderChatCard(c, status) {
  const card = document.createElement("article");
  card.className = `gap-card ${status === "pending" ? "pending-card" : "learned-card"}`;
  card.innerHTML = `
    <div class="gap-top">
      <div>
        <div class="gap-topic">${escapeHtml(c.label || "Aprendido de chat humano")}</div>
      </div>
      <div class="gap-badges">
        <span class="gap-badge ${status === "pending" ? "pending" : "learned"}">
          ${status === "pending" ? "Por revisar" : "Aprendido"}
        </span>
        ${c.confidence ? `<span class="gap-badge">${escapeHtml(String(c.confidence))}</span>` : ""}
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block question">
        <div class="label">Cliente dijo</div>
        <div class="value">${escapeHtml(c.userMessage)}</div>
      </div>
      <div class="info-block answer">
        <div class="label">${status === "pending" ? "Respuesta sugerida (estilo Alejandro)" : "Lo que Lucy puede usar ahora"}</div>
        <div class="value">${escapeHtml(c.suggestedResponse)}</div>
      </div>
    </div>
    ${
      c.contextSnippet
        ? `<div class="info-block" style="border-top:1px solid var(--border);background:#fff">
            <div class="label">Contexto</div>
            <div class="value">${escapeHtml(c.contextSnippet)}</div>
          </div>`
        : ""
    }
    <div class="gap-footer">
      <span>${c.kommoLeadId ? `Lead Kommo #${escapeHtml(c.kommoLeadId)}` : "Sin lead"}</span>
      <span>${formatDate(c.createdAt)}</span>
    </div>
  `;
  return card;
}

function renderPendingGapCard(gap) {
  const card = document.createElement("article");
  card.className = "gap-card pending-card";
  card.dataset.id = gap.id;
  const badgeClass = gap.gapType === "price" ? "gap-badge price" : "gap-badge";
  card.innerHTML = `
    <div class="gap-top">
      <div><div class="gap-topic">${escapeHtml(gap.topic || "Sin tema en catálogo")}</div></div>
      <div class="gap-badges">
        <span class="gap-badge pending">Pendiente</span>
        <span class="${badgeClass}">${escapeHtml(gapTypeLabel(gap.gapType))}</span>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block question">
        <div class="label">Cliente preguntó</div>
        <div class="value">${escapeHtml(gap.question)}</div>
      </div>
      <div class="info-block lucy-said">
        <div class="label">Lucy respondió (sin dato en catálogo)</div>
        <div class="value">${escapeHtml(gap.lucyResponse || "—")}</div>
      </div>
    </div>
    <div class="answer-form">
      <label>Tu respuesta — esto es lo que Lucy aprenderá
        <textarea class="answer-box" data-answer placeholder="Escribe la respuesta correcta…"></textarea>
      </label>
      <div class="gap-actions">
        <button type="button" class="btn-save save-btn">Guardar y enseñar a Lucy</button>
        <button type="button" class="btn-ghost dismiss-btn">Descartar</button>
      </div>
    </div>
    <div class="gap-footer">
      <span>${gap.kommoLeadId ? `Lead #${escapeHtml(gap.kommoLeadId)}` : "Sin lead"}</span>
      <span>${formatDate(gap.createdAt)}</span>
    </div>
  `;
  card.querySelector(".save-btn")?.addEventListener("click", () => saveAnswer(gap.id, card));
  card.querySelector(".dismiss-btn")?.addEventListener("click", () => dismissGap(gap.id));
  return card;
}

function renderLearnedGapCard(gap) {
  const card = document.createElement("article");
  card.className = "gap-card learned-card";
  card.innerHTML = `
    <div class="gap-top">
      <div><div class="gap-topic">${escapeHtml(gap.topic || "Conocimiento enseñado")}</div></div>
      <div class="gap-badges"><span class="gap-badge learned">Aprendido</span></div>
    </div>
    <div class="info-grid">
      <div class="info-block question">
        <div class="label">Pregunta del cliente</div>
        <div class="value">${escapeHtml(gap.question)}</div>
      </div>
      <div class="info-block answer">
        <div class="label">Respuesta enseñada</div>
        <div class="value">${escapeHtml(gap.answer || "—")}</div>
      </div>
    </div>
    <div class="gap-footer">
      <span>${formatDate(gap.answeredAt)}</span>
    </div>
  `;
  return card;
}

async function loadList() {
  if (currentMode === "info") {
    await loadInfoMode();
    return;
  }

  if (infoPanel) {
    infoPanel.classList.add("hidden");
    infoPanel.innerHTML = "";
  }

  const introKey =
    currentMode === "chats"
      ? currentStatus === "pending"
        ? "chats_pending"
        : "chats_approved"
      : currentStatus === "pending"
        ? "gaps_pending"
        : "gaps_answered";
  sectionIntro.innerHTML = INTRO[introKey] ?? "";
  gapsList.innerHTML = "";

  try {
    if (currentMode === "chats") {
      const status = currentStatus === "pending" ? "pending" : "approved";
      const data = await api(`/aprendizaje/from-chats?status=${status}&limit=50`);
      lastLoadError = null;
      if (!data.candidates?.length) {
        emptyState.classList.remove("hidden");
        emptyState.innerHTML =
          status === "pending"
            ? `<strong>No hay candidatos por revisar</strong>Cuando Alejandro atienda en Humano Trabaja, Lucy extrae pares automáticamente. Pulsa «Sincronizar chats ahora» para forzar una pasada.`
            : `<strong>Aún no hay aprendizajes de chats</strong>Lucy aprende cuando Alejandro responde en Kommo (etapa Humano Trabaja o Cotización). El cron corre cada 5 minutos. Usa «Sincronizar chats ahora».`;
        return;
      }
      emptyState.classList.add("hidden");
      for (const c of data.candidates) gapsList.appendChild(renderChatCard(c, status));
      return;
    }

    const status = currentStatus === "answered" ? "answered" : "pending";
    const data = await api(`/knowledge-gaps?status=${status}&limit=50`);
    lastLoadError = null;
    if (!data.gaps?.length) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML =
        status === "pending"
          ? `<strong>No hay huecos pendientes</strong>El catálogo del Sheet cubre las preguntas recientes.`
          : `<strong>Aún no hay huecos enseñados</strong>Cuando enseñes una respuesta en «No sabe», aparecerá aquí.`;
      return;
    }
    emptyState.classList.add("hidden");
    for (const gap of data.gaps) {
      gapsList.appendChild(
        status === "pending" ? renderPendingGapCard(gap) : renderLearnedGapCard(gap)
      );
    }
  } catch (err) {
    lastLoadError = err instanceof Error ? err.message : String(err);
    emptyState.classList.remove("hidden");
    emptyState.innerHTML = `<strong>No se pudo cargar la lista</strong>${escapeHtml(lastLoadError)}`;
    throw err;
  }
}

async function saveAnswer(id, card) {
  const textarea = card.querySelector("[data-answer]");
  const answer = textarea?.value?.trim();
  if (!answer) {
    textarea?.focus();
    return;
  }
  const btn = card.querySelector(".save-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Guardando…";
  }
  try {
    await api(`/knowledge-gaps/${id}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    });
    await refresh();
  } catch (err) {
    alert(err.message || "Error al guardar");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Guardar y enseñar a Lucy";
    }
  }
}

async function dismissGap(id) {
  if (!confirm("¿Descartar esta pregunta? Lucy no aprenderá una respuesta.")) return;
  await api(`/knowledge-gaps/${id}/dismiss`, { method: "POST" });
  await refresh();
}

async function runSyncNow() {
  if (!btnSyncNow) return;
  btnSyncNow.disabled = true;
  btnSyncNow.textContent = "Sincronizando…";
  syncStatus.classList.remove("hidden");
  syncStatus.textContent = "Leyendo chats de Humano Trabaja / Cotización en Kommo…";
  try {
    const res = await fetchJson("/kommo/cron/learning");
    if (!res.ok) throw new Error(res.error || "sync_failed");
    const d = res.data;
    syncStatus.textContent = `Listo: ${d.leads ?? 0} chats sincronizados · ${d.candidates ?? 0} aprendizajes nuevos · elegibles ${d.eligible ?? "?"} · sin talkId ${d.skippedNoTalkId ?? 0}`;
    await refresh();
  } catch (err) {
    syncStatus.textContent = `Error al sincronizar: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    btnSyncNow.disabled = false;
    btnSyncNow.textContent = "Sincronizar chats ahora";
  }
}

async function refresh() {
  syncStatusTabsForMode();
  await loadSystemDiagnostics();
  try {
    await loadStats();
    await loadList();
  } catch {
    await loadSystemDiagnostics();
  }
}

btnRetryErrors?.addEventListener("click", () => {
  btnRetryErrors.disabled = true;
  btnRetryErrors.textContent = "Revisando…";
  refresh()
    .catch(() => {})
    .finally(() => {
      btnRetryErrors.disabled = false;
      btnRetryErrors.textContent = "Revisar de nuevo";
    });
});

btnSyncNow?.addEventListener("click", () => {
  runSyncNow().catch(() => {});
});

function applyModeTabUi() {
  document.querySelectorAll("#mode-tabs .view-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === currentMode);
  });
  if (btnSyncNow) btnSyncNow.classList.toggle("hidden", currentMode === "info");
  syncStatusTabsForMode();
  updateTabCounts();
}

document.querySelectorAll("#mode-tabs .view-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    currentMode = mode === "gaps" ? "gaps" : mode === "info" ? "info" : "chats";
    currentStatus =
      currentMode === "chats" ? "approved" : currentMode === "gaps" ? "pending" : currentStatus;
    applyModeTabUi();
    await loadList();
  });
});

document.querySelectorAll("#view-tabs .view-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll("#view-tabs .view-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status || "approved";
    await loadList();
  });
});

// Deep-link: /aprendizaje/?tab=info (desde Panel → Información para Lucy)
try {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "info") {
    currentMode = "info";
    applyModeTabUi();
  }
} catch {
  /* ignore */
}

refresh().catch(() => {
  /* errores en diagnóstico */
});
