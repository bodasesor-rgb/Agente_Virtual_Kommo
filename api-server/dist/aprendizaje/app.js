const API = "/api";

const sectionIntro = document.getElementById("section-intro");
const statsRow = document.getElementById("stats-row");
const gapsList = document.getElementById("gaps-list");
const emptyState = document.getElementById("empty-state");
const systemErrorsBox = document.getElementById("system-errors");
const systemErrorsTitle = document.getElementById("system-errors-title");
const systemErrorsSummary = document.getElementById("system-errors-summary");
const systemErrorsList = document.getElementById("system-errors-list");
const systemErrorsChecked = document.getElementById("system-errors-checked");
const btnRetryErrors = document.getElementById("btn-retry-errors");

let currentStatus = "pending";
let lastLoadError = null;

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

async function fetchJson(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json" },
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
  let ops = { ok: false };
  let gaps = { ok: false };

  try {
    health = await fetchJson("/health");
  } catch (err) {
    health = { ok: false, error: err instanceof Error ? err.message : "network" };
  }

  if (!health.ok) {
    const is503 = health.status === 503 || health.error === "not_json";
    items.push({
      id: "server",
      label: "Servidor Lucy",
      status: "error",
      resolved: false,
      detail: is503
        ? "Lucy no responde (503). El proceso Node en Hostinger está caído o reiniciando."
        : friendlyError(health.error, "No se pudo conectar con Lucy"),
      fix: "hPanel → Node.js → Reiniciar o Redesplegar desde main. Luego pulsa «Revisar de nuevo».",
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

    items.push({
      id: "openai",
      label: "OpenAI",
      status: h.openai_configured ? "ok" : "error",
      resolved: !!h.openai_configured,
      detail: h.openai_configured
        ? "Key configurada — Lucy puede usar GPT."
        : "Falta la variable OPEN_AI en Hostinger.",
      fix: h.openai_configured ? null : "hPanel → Variables de entorno → OPEN_AI = sk-proj-…",
    });

    const catalog = h.catalog ?? {};
    const catalogOk = catalog.loaded && !catalog.lastError;
    items.push({
      id: "catalog",
      label: "Catálogo de precios",
      status: catalogOk ? "ok" : catalog.lastError ? "error" : "warn",
      resolved: catalogOk,
      detail: catalog.lastError
        ? `Error al cargar Sheet: ${catalog.lastError}`
        : catalog.loaded
          ? `${catalog.pricedServicesCount ?? 0} precios cargados.`
          : "El catálogo aún no terminó de cargar (normal tras reinicio).",
      fix: catalog.lastError ? "Panel → Estado → «Reparar ahora» recarga el Sheet." : null,
    });
  }

  try {
    gaps = await fetchJson("/knowledge-gaps/stats");
  } catch (err) {
    gaps = { ok: false, error: err instanceof Error ? err.message : "network" };
  }

  if (!gaps.ok) {
    items.push({
      id: "gaps_api",
      label: "API de aprendizaje",
      status: "error",
      resolved: false,
      detail: friendlyError(gaps.error, "No se pudo leer /api/knowledge-gaps/stats"),
      fix: gaps.error === "unauthorized"
        ? "Confirma en Panel → Estado que no diga «unauthorized». Si persiste, redeploy en Hostinger."
        : "Espera 1 minuto tras un reinicio y pulsa «Revisar de nuevo».",
    });
  } else {
    items.push({
      id: "gaps_api",
      label: "API de aprendizaje",
      status: "ok",
      resolved: true,
      detail: `Conectada · ${gaps.data.pending ?? 0} pendientes · ${gaps.data.answered ?? 0} ya enseñadas.`,
    });
  }

  if (health.ok) {
    try {
      ops = await fetchJson("/ops/status");
    } catch {
      ops = { ok: false };
    }
    if (!ops.ok && ops.error === "unauthorized") {
      items.push({
        id: "ops_auth",
        label: "Panel de vigilancia",
        status: "error",
        resolved: false,
        detail: "Estado de Lucy también devuelve unauthorized.",
        fix: "Hostinger necesita el último código (commit con fix de rutas). Redeploy desde main.",
      });
    }
  }

  if (lastLoadError) {
    items.push({
      id: "load_gaps",
      label: "Lista de preguntas",
      status: "error",
      resolved: false,
      detail: friendlyError(lastLoadError, lastLoadError),
      fix: "Corrige los errores de arriba y pulsa «Revisar de nuevo».",
    });
  } else if (health.ok && gaps.ok) {
    items.push({
      id: "load_gaps",
      label: "Lista de preguntas",
      status: "ok",
      resolved: true,
      detail: "La lista de aprendizaje se cargó correctamente.",
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
      "Aprendizaje, servidor y catálogo responden bien. Puedes enseñar respuestas con normalidad.";
  } else if (errors > 0) {
    systemErrorsBox.classList.add("has-errors");
    systemErrorsTitle.textContent =
      errors === 1 ? "1 error activo" : `${errors} errores activos`;
    systemErrorsSummary.textContent =
      "Hay problemas que impiden usar Aprendizaje hasta que se resuelvan (marca «Pendiente»).";
  } else {
    systemErrorsBox.classList.add("has-warns");
    systemErrorsTitle.textContent = "Avisos — sin bloqueo grave";
    systemErrorsSummary.textContent =
      "Algo requiere atención pero puedes seguir trabajando.";
  }

  systemErrorsList.innerHTML = items.map(diagItem).join("");
  systemErrorsChecked.textContent = `Última revisión: ${checkedAt}`;
}


const INTRO = {
  pending:
    "Estas son preguntas de clientes reales donde <strong>Lucy no encontró precio o servicio en el catálogo</strong>. Escribe la respuesta correcta y Lucy la usará en futuras conversaciones.",
  answered:
    "Todo lo que <strong>ya le enseñaste a Lucy</strong>: la pregunta del cliente, lo que Lucy dijo sin datos, y la respuesta correcta que quedó guardada.",
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
  const map = {
    price: "Precio",
    inclusion: "Inclusión",
    service: "Servicio",
    unknown: "General",
  };
  return map[type] || type;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateTabCounts(stats) {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const key = el.dataset.count;
    if (key && stats[key] !== undefined) el.textContent = String(stats[key]);
  });
}

async function loadStats() {
  try {
    const stats = await api("/knowledge-gaps/stats");
    lastLoadError = null;
    const total = stats.pending + stats.answered + stats.dismissed;

  statsRow.innerHTML = `
    <div class="stat-card pending">
      <strong>${stats.pending}</strong>
      <span>No sabe — pendientes</span>
    </div>
    <div class="stat-card learned">
      <strong>${stats.answered}</strong>
      <span>Ya aprendió</span>
    </div>
    <div class="stat-card dismissed">
      <strong>${stats.dismissed}</strong>
      <span>Descartadas</span>
    </div>
    <div class="stat-card total">
      <strong>${total}</strong>
      <span>Total registradas</span>
    </div>
  `;

    updateTabCounts(stats);
  } catch (err) {
    lastLoadError = err instanceof Error ? err.message : String(err);
    statsRow.innerHTML = `
      <div class="stat-card pending"><strong>—</strong><span>No sabe — error al cargar</span></div>
      <div class="stat-card learned"><strong>—</strong><span>Ya aprendió</span></div>
    `;
    throw err;
  }
}

function renderPendingCard(gap) {
  const card = document.createElement("article");
  card.className = "gap-card pending-card";
  card.dataset.id = gap.id;

  const badgeClass = gap.gapType === "price" ? "gap-badge price" : "gap-badge";

  card.innerHTML = `
    <div class="gap-top">
      <div>
        <div class="gap-topic">${escapeHtml(gap.topic || "Sin tema en catálogo")}</div>
      </div>
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
        <div class="value">${escapeHtml(gap.lucyResponse || "— Aún no respondió en el chat —")}</div>
      </div>
    </div>
    ${
      gap.contextSnippet
        ? `<div class="info-block" style="border-top:1px solid var(--border);background:#fff">
            <div class="label">Contexto de la conversación</div>
            <div class="value">${escapeHtml(gap.contextSnippet)}</div>
          </div>`
        : ""
    }
    <div class="answer-form">
      <label>Tu respuesta — esto es lo que Lucy aprenderá
        <textarea class="answer-box" data-answer placeholder="Ej: El DJ desde $8,500 por 4 horas, incluye equipo básico. Alejandro confirma según el evento."></textarea>
      </label>
      <div class="gap-actions">
        <button type="button" class="btn-save save-btn">Guardar y enseñar a Lucy</button>
        <button type="button" class="btn-ghost dismiss-btn">Descartar</button>
      </div>
    </div>
    <div class="gap-footer">
      <span>${gap.kommoLeadId ? `Lead Kommo #${escapeHtml(gap.kommoLeadId)}` : "Sin lead vinculado"}</span>
      <span>Detectado: ${formatDate(gap.createdAt)}</span>
    </div>
  `;

  card.querySelector(".save-btn")?.addEventListener("click", () => saveAnswer(gap.id, card));
  card.querySelector(".dismiss-btn")?.addEventListener("click", () => dismissGap(gap.id));

  return card;
}

function renderLearnedCard(gap) {
  const card = document.createElement("article");
  card.className = "gap-card learned-card";
  card.dataset.id = gap.id;

  const badgeClass = gap.gapType === "price" ? "gap-badge price" : "gap-badge";

  card.innerHTML = `
    <div class="gap-top">
      <div>
        <div class="gap-topic">${escapeHtml(gap.topic || "Conocimiento enseñado")}</div>
      </div>
      <div class="gap-badges">
        <span class="gap-badge learned">Aprendido</span>
        <span class="${badgeClass}">${escapeHtml(gapTypeLabel(gap.gapType))}</span>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block question">
        <div class="label">Pregunta del cliente</div>
        <div class="value">${escapeHtml(gap.question)}</div>
      </div>
      <div class="info-block lucy-said">
        <div class="label">Lo que Lucy dijo antes</div>
        <div class="value">${escapeHtml(gap.lucyResponse || "—")}</div>
      </div>
      <div class="info-block answer">
        <div class="label">Respuesta enseñada (lo que Lucy usa ahora)</div>
        <div class="value">${escapeHtml(gap.answer || "—")}</div>
      </div>
    </div>
    <div class="gap-footer">
      <span>${gap.answeredBy ? `Enseñado por ${escapeHtml(gap.answeredBy)}` : "Enseñado desde el panel"}</span>
      <span>${formatDate(gap.answeredAt)}${gap.kommoLeadId ? ` · Lead #${escapeHtml(gap.kommoLeadId)}` : ""}</span>
    </div>
  `;

  return card;
}

async function loadGaps() {
  sectionIntro.innerHTML = INTRO[currentStatus] ?? "";
  gapsList.innerHTML = "";

  try {
    const data = await api(`/knowledge-gaps?status=${currentStatus}&limit=50`);
    lastLoadError = null;

    if (!data.gaps?.length) {
    emptyState.classList.remove("hidden");
    emptyState.innerHTML =
      currentStatus === "pending"
        ? `<strong>No hay preguntas pendientes</strong>Lucy está al día con el catálogo del Sheet. Cuando un cliente pregunte algo sin precio, aparecerá aquí.`
        : `<strong>Aún no hay aprendizajes guardados</strong>Cuando enseñes una respuesta en la pestaña «No sabe», aparecerá aquí con la pregunta y la respuesta correcta.`;
    return;
  }

  emptyState.classList.add("hidden");

    for (const gap of data.gaps) {
      gapsList.appendChild(
        currentStatus === "pending" ? renderPendingCard(gap) : renderLearnedCard(gap),
      );
    }
  } catch (err) {
    lastLoadError = err instanceof Error ? err.message : String(err);
    emptyState.classList.remove("hidden");
    emptyState.innerHTML = `<strong>No se pudo cargar la lista</strong>${escapeHtml(lastLoadError)} — revisa el cuadro de diagnóstico arriba.`;
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

async function refresh() {
  await loadSystemDiagnostics();
  try {
    await loadStats();
    await loadGaps();
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

document.querySelectorAll(".view-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status;
    await loadGaps();
  });
});

refresh().catch(() => {
  /* errores mostrados en system-errors y empty-state */
});
