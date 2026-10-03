const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const btnRun = document.getElementById("btn-run");
const btnRefresh = document.getElementById("btn-refresh");
const btnSendCursor = document.getElementById("btn-send-cursor");
const modelEl = document.getElementById("auditor-model");
const progressEl = document.getElementById("audit-progress");
const phaseEl = document.getElementById("audit-phase");
const counterEl = document.getElementById("audit-counter");
const barFillEl = document.getElementById("audit-bar-fill");
const detailEl = document.getElementById("audit-detail");
const liveFindingsEl = document.getElementById("audit-live-findings");
const workingBanner = document.getElementById("working-banner");
const workingList = document.getElementById("working-list");
const workingTitle = document.getElementById("working-title");
const btnGotoProgress = document.getElementById("btn-goto-progress");
const btnCleanup = document.getElementById("btn-cleanup");
const jobsEl = document.getElementById("jobs");
const jobsListEl = document.getElementById("jobs-list");
const jobsNoteEl = document.getElementById("jobs-note");

if (new URLSearchParams(window.location.search).get("vista") === "supervisor") {
  document.body.classList.add("vista-supervisor");
  document.getElementById("quality")?.setAttribute("open", "");
  const h1 = document.querySelector(".header h1");
  if (h1) h1.textContent = "Supervisor de Lucy";
  const eyebrow = document.querySelector(".header .eyebrow");
  if (eyebrow) eyebrow.textContent = "Calidad y aprendizaje";
  document.title = "Supervisor de Lucy — Bodasesor";
}

let currentStatus = "open";
let pollTimer = null;
let jobsTimer = null;
let agentConfigured = false;
let hasLiveJob = false;

const JOB_ACTIVE = new Set(["creating", "running", "publishing"]);

function hhmm(iso) {
  return iso ? new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "";
}

function minutesSince(iso) {
  return iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0;
}

function jobHeadline(j) {
  switch (j.status) {
    case "creating":
      return { cls: "progress", text: `Preparando agente… (desde ${hhmm(j.createdAt)})` };
    case "running":
      return {
        cls: "progress",
        text: `Reparando — trabajando desde ${hhmm(j.createdAt)} (${minutesSince(j.createdAt)} min)`,
      };
    case "fix_ready":
      return { cls: "ready", text: "Arreglo listo — falta publicarlo" };
    case "publishing":
      return { cls: "progress", text: `Publicando… (desde ${hhmm(j.publishRequestedAt)})` };
    case "published":
      return j.liveAt
        ? { cls: "ok", text: `Publicado y activo en Lucy desde ${new Date(j.liveAt).toLocaleString("es-MX")}` }
        : { cls: "ok", text: "Publicado — se aplica en Lucy en unos minutos (despliegue automático)" };
    case "no_changes":
      return { cls: "mute", text: "Terminó sin cambios de código" };
    case "cancelled":
      return { cls: "mute", text: "Cancelado" };
    case "discarded":
      return { cls: "mute", text: "Arreglo descartado (no se publicó)" };
    default:
      return { cls: "error", text: "Error" };
  }
}

function outcomeHtml(o) {
  if (!o) return "";
  const block = (title, items) =>
    items && items.length
      ? `<div class="job-outcome"><strong>${title}</strong><ul>${items
          .map((x) => `<li>${escapeHtml(x.text || "—")} <span class="muted">(${x.ids.length})</span></li>`)
          .join("")}</ul></div>`
      : "";
  return (
    block("Qué arregló", o.fixed) +
    block("No eran errores", o.falsePositive) +
    block("No pudo arreglar (vuelven a Abiertas)", o.notFixed) +
    (o.newRules && o.newRules.length
      ? `<div class="job-outcome"><strong>Lo que aprendió el supervisor</strong><ul>${o.newRules
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul></div>`
      : "") +
    (o.tests ? `<p class="muted">Pruebas: ${escapeHtml(o.tests)}</p>` : "")
  );
}

function jobCardHtml(j) {
  const head = jobHeadline(j);
  const live = JOB_ACTIVE.has(j.status);
  const steps = (j.steps || []).slice(-8).reverse();
  const problems = (j.problems || [])
    .map(
      (p) =>
        `<li><span class="tag">${escapeHtml(p.category)}</span>${escapeHtml(p.label)}${
          p.count > 1 ? ` <span class="muted">· ${p.count} chats</span>` : ""
        }</li>`
    )
    .join("");
  const links = [
    j.agentUrl ? `<a href="${escapeHtml(j.agentUrl)}" target="_blank" rel="noopener">Ver agente en Cursor</a>` : "",
    j.prUrl ? `<a href="${escapeHtml(j.prUrl)}" target="_blank" rel="noopener">Ver cambios (PR)</a>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const actions = [
    j.status === "fix_ready" ? `<button type="button" class="btn-sm ok" data-job-act="publish">Publicar</button>` : "",
    j.status === "fix_ready" ? `<button type="button" class="btn-sm mute" data-job-act="cancel">Descartar arreglo</button>` : "",
    live ? `<button type="button" class="btn-sm mute" data-job-act="cancel">Cancelar</button>` : "",
  ]
    .filter(Boolean)
    .join("");
  return `
    <article class="job job-${head.cls}" data-job-id="${escapeHtml(j.id)}">
      <div class="job-head">
        ${live ? '<span class="pulse" aria-hidden="true"></span>' : ""}
        <strong>${escapeHtml(head.text)}</strong>
        <span class="muted">${escapeHtml((j.repairIds || []).length)} reparación(es) · ${new Date(j.createdAt).toLocaleString("es-MX")}${
          j.model ? ` · ${escapeHtml(j.model)}${j.escalatedFrom ? " (2.º intento)" : ""}` : ""
        }</span>
      </div>
      ${j.error ? `<p class="job-error">${escapeHtml(j.error)}</p>` : ""}
      ${problems ? `<ul class="job-problems">${problems}</ul>` : ""}
      ${
        steps.length
          ? `<ol class="job-steps">${steps
              .map((s) => `<li><span class="muted">${hhmm(s.at)}</span> ${escapeHtml(s.text)}</li>`)
              .join("")}</ol>`
          : ""
      }
      ${outcomeHtml(j.outcome)}
      ${j.summary ? `<details><summary>Lo que dijo el agente</summary><p class="job-summary">${escapeHtml(j.summary)}</p></details>` : ""}
      ${links ? `<p class="job-links">${links}</p>` : ""}
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </article>`;
}

async function loadJobs() {
  const data = await fetch("/api/reparaciones/jobs")
    .then((r) => r.json())
    .catch(() => null);
  if (!data || !jobsEl) return { live: false };
  agentConfigured = Boolean(data.configured);
  const jobs = data.jobs || [];
  const recent = jobs.filter(
    (j, i) => JOB_ACTIVE.has(j.status) || j.status === "fix_ready" || i < 3
  );
  const live = jobs.some((j) => JOB_ACTIVE.has(j.status));
  hasLiveJob = live || jobs.some((j) => j.status === "fix_ready");
  jobsEl.classList.toggle("hidden", recent.length === 0 && agentConfigured);
  if (jobsNoteEl) {
    jobsNoteEl.textContent = agentConfigured
      ? `${data.jobs_today ?? 0}/${data.max_jobs_per_day ?? 12} envíos hoy${data.model ? ` · ${data.model}` : ""}${data.fallback_model ? ` → ${data.fallback_model} si no puede` : ""}${data.auto_publish ? " · publica solo" : ""}${data.auto_send ? " · envía la cola solo" : ""}`
      : "Falta CURSOR_API_KEY en Hostinger: sin ella no hay avance en vivo.";
  }
  jobsListEl.innerHTML = recent.length
    ? recent.map(jobCardHtml).join("")
    : agentConfigured
      ? ""
      : `<p class="muted">Cuando pegues CURSOR_API_KEY, aquí verás qué está reparando Cursor, cada paso, y el botón para publicar.</p>`;
  if (!agentConfigured) jobsEl.classList.remove("hidden");
  ensureJobsPoll(live);
  return { live };
}

function ensureJobsPoll(live) {
  const every = live ? 5_000 : 0;
  if (every && !jobsTimer) {
    jobsTimer = setInterval(async () => {
      const before = hasLiveJob;
      const { live: still } = await loadJobs();
      if (!still && before) void refresh({ quiet: true });
    }, every);
  } else if (!every && jobsTimer) {
    clearInterval(jobsTimer);
    jobsTimer = null;
  }
}

const STATUS_LABEL = {
  open: "Abierta",
  auto_flagged: "Auto-flag",
  in_progress: "En Cursor",
  resolved: "Hecha",
  dismissed: "Descartada",
};

async function sendToCursor(repairId) {
  const res = await fetch("/api/reparaciones/send-to-cursor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(repairId ? { repairId } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.message || data.error || `Error al enviar (${res.status})`);
    return;
  }
  if (data.mode === "cloud_agent") {
    await refresh();
    jobsEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const n = data.sent || 0;
  const names = (data.workingOn || [])
    .slice(0, 5)
    .map((w) => {
      const lead = w.kommoLeadId ? `Lead ${w.kommoLeadId}` : "sin lead";
      return `· ${w.category} (${lead})`;
    })
    .join("\n");
  alert(
    n
      ? `Enviado a Cursor: ${n} error(es) marcados «En Cursor».\n${names}${
          n > 5 ? `\n… y ${n - 5} más` : ""
        }\n\nCuando Cursor los arregle, aparecerán en Resueltas con la descripción.`
      : data.message || "Sin hallazgos para enviar"
  );
  currentStatus = "in_progress";
  document.querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.status === "in_progress");
  });
  await refresh();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function statusBadgeClass(status) {
  if (status === "in_progress") return "progress";
  if (status === "resolved") return "ok";
  if (status === "dismissed") return "mute";
  return "";
}

async function loadStats() {
  const s = await fetch("/api/reparaciones/stats").then((r) => r.json());
  document.getElementById("stat-open").textContent = String(
    (s.open ?? 0) + (s.auto_flagged ?? 0)
  );
  document.getElementById("stat-progress").textContent = String(s.in_progress ?? 0);
  document.getElementById("stat-flagged").textContent = String(s.auto_flagged ?? 0);
  document.getElementById("stat-resolved").textContent = String(s.resolved ?? 0);
  const model = String(s.auditor_model ?? "—");
  document.getElementById("stat-quota").textContent =
    `${s.auditor_calls_today ?? 0}/${s.auditor_max_per_day ?? 40}`;
  const usd = Number(s.auditor_usd_today);
  const tokens = Number(s.auditor_tokens_today ?? 0);
  const spendEl = document.getElementById("stat-spend");
  if (spendEl) {
    if (Number.isFinite(usd)) {
      const money =
        usd > 0 && usd < 0.01 ? `~$${usd.toFixed(4)}` : `~$${usd.toFixed(2)}`;
      spendEl.textContent = tokens > 0 ? `${money} · ${tokens} tok` : money;
    } else {
      spendEl.textContent = "—";
    }
  }
  if (modelEl) modelEl.textContent = model;
  return s;
}

async function loadWorkingBanner() {
  const data = await fetch("/api/reparaciones?status=in_progress&limit=20").then((r) =>
    r.json()
  );
  const repairs = data.repairs ?? [];
  if (!workingBanner || !workingList) return repairs;
  if (repairs.length === 0) {
    workingBanner.classList.add("hidden");
    workingList.innerHTML = "";
  } else {
    workingBanner.classList.remove("hidden");
    if (workingTitle) {
      workingTitle.textContent =
        repairs.length === 1
          ? "Cursor está trabajando en 1 error"
          : `Cursor está trabajando en ${repairs.length} errores`;
    }
    workingList.innerHTML = repairs
      .map((r) => {
        const lead = r.kommoLeadId ? `Lead ${escapeHtml(r.kommoLeadId)}` : "Sin lead";
        return `<li>
          <span class="tag">${escapeHtml(r.category)}</span>
          <span class="muted">${lead}</span>
          — ${escapeHtml((r.evidence || "").slice(0, 140))}
        </li>`;
      })
      .join("");
  }
  return repairs;
}

function cardHtml(r) {
  const sev = r.severity === "error" ? "error" : r.severity === "warn" ? "warn" : "";
  const lead = r.kommoLeadId ? `Lead ${escapeHtml(r.kommoLeadId)}` : "Sin lead";
  const canAct =
    r.status === "open" || r.status === "auto_flagged" || r.status === "in_progress";
  const statusLabel = STATUS_LABEL[r.status] || r.status;
  const when =
    r.status === "resolved" && r.resolvedAt
      ? `Resuelto ${new Date(r.resolvedAt).toLocaleString("es-MX")}`
      : r.status === "in_progress" && r.updatedAt
        ? `Enviado ${new Date(r.updatedAt).toLocaleString("es-MX")}`
        : new Date(r.createdAt).toLocaleString("es-MX");

  let fixBlock = "";
  if (r.status === "resolved" && r.appliedRepair) {
    fixBlock = `<div class="repair applied">
        <strong>Qué se arregló</strong>
        <p>${escapeHtml(r.appliedRepair)}</p>
        ${r.resolvedBy ? `<p class="muted">Por: ${escapeHtml(r.resolvedBy)}</p>` : ""}
      </div>`;
  } else if (r.status === "in_progress") {
    fixBlock = `<div class="repair working">
        <strong>En curso con Cursor</strong>
        <p class="muted">${
          agentConfigured
            ? "El avance en vivo está arriba, en «Arreglos con Cursor». Al publicarse, queda en Resueltas con lo que se cambió."
            : "Enviada por webhook (sin seguimiento). Si en 6 h no hay noticias, vuelve sola a Abiertas."
        }</p>
      </div>`;
  } else if (r.status === "dismissed" && r.appliedRepair) {
    fixBlock = `<div class="repair">
        <strong>Por qué se descartó</strong>
        <p>${escapeHtml(r.appliedRepair)}</p>
      </div>`;
  }

  return `
    <article class="card ${r.status === "in_progress" ? "card-working" : ""} ${
      r.status === "resolved" ? "card-done" : ""
    }" data-id="${escapeHtml(r.id)}">
      <div class="card-top">
        <div class="badges">
          <span class="badge ${sev}">${escapeHtml(r.severity)}</span>
          <span class="badge">${escapeHtml(r.category)}</span>
          <span class="badge">${escapeHtml(r.source)}</span>
          <span class="badge ${statusBadgeClass(r.status)}">${escapeHtml(statusLabel)}</span>
        </div>
        <span class="muted">${lead} · ${when}</span>
      </div>
      <h3>Evidencia</h3>
      <p>${escapeHtml(r.evidence)}</p>
      <div class="repair">
        <strong>Reparación propuesta</strong>
        <p>${escapeHtml(r.proposedRepair)}</p>
      </div>
      ${fixBlock}
      ${
        canAct
          ? `<div class="actions">
              <button type="button" class="btn-sm ok" data-act="resolve">Marcar hecha</button>
              <button type="button" class="btn-sm mute" data-act="dismiss">Descartar</button>
              ${
                r.status !== "in_progress"
                  ? `<button type="button" class="btn-sm" data-act="cursor">Enviar solo esta a Cursor</button>`
                  : agentConfigured
                    ? ""
                    : `<button type="button" class="btn-sm" data-act="cursor">Reenviar a Cursor</button>`
              }
            </div>`
          : ""
      }
    </article>`;
}

async function loadList() {
  const limit = currentStatus === "resolved" || currentStatus === "all" ? 200 : 50;
  const data = await fetch(
    `/api/reparaciones?status=${encodeURIComponent(currentStatus)}&limit=${limit}`
  ).then((r) => r.json());
  const repairs = data.repairs ?? [];
  listEl.innerHTML = repairs.map(cardHtml).join("");
  emptyEl.classList.toggle("hidden", repairs.length > 0);
  if (repairs.length === 0) {
    emptyEl.textContent =
      currentStatus === "resolved"
        ? "Aún no hay reparaciones hechas. Cuando Cursor (o tú) marque un error como hecho con descripción, queda aquí para siempre."
        : "Sin hallazgos en este filtro.";
  }
}

function ensurePoll(hasInProgress) {
  if (hasInProgress && !pollTimer) {
    pollTimer = setInterval(() => {
      void refresh({ quiet: true });
    }, 20_000);
  } else if (!hasInProgress && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

const CATEGORY_LABEL = {
  loop_links: "links repetidos",
  repeat_reply: "respuesta repetida",
  premature_close: "cerró antes de tiempo",
  bad_field: "dato mal anotado",
  stuck_funnel: "embudo trabado",
  ignored_question: "ignoró una pregunta",
  asked_known_data: "pidió un dato ya dado",
  misunderstood: "entendió mal",
  wrong_info: "información incorrecta",
  tone: "tono / mensaje confuso",
  handoff: "no pasó a humano",
};

async function loadQuality() {
  const body = document.getElementById("quality-body");
  const note = document.getElementById("quality-note");
  if (!body) return;
  const q = await fetch("/api/reparaciones/quality")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!q) {
    body.innerHTML = `<p class="muted">No se pudo cargar el reporte.</p>`;
    return;
  }
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const noisy = q.rules.filter((r) => r.noisy);
  const c = q.cursor;
  if (note) {
    note.textContent = `· ${q.coverage.nightsLast7}/7 noches auditadas · ${c.published} arreglos publicados (30 días)${
      noisy.length ? ` · ${noisy.length} regla(s) con muchas falsas alarmas` : ""
    }`;
  }
  const rules = q.rules
    .slice(0, 20)
    .map(
      (r) => `<tr class="${r.noisy ? "noisy" : ""}">
        <td>${escapeHtml(CATEGORY_LABEL[r.category] || r.category)}</td>
        <td>${r.source === "flash" ? "Gemini" : "regla fija"}</td>
        <td>${r.total}</td><td>${r.fixed}</td><td>${r.falseAlarm}</td><td>${r.pending}</td>
        <td>${pct(r.falseAlarmRate)}${r.noisy ? " ⚠" : ""}</td>
      </tr>`
    )
    .join("");
  const runs = q.coverage.runs
    .map(
      (r) => `<tr>
        <td>${new Date(r.at).toLocaleString("es-MX")}</td>
        <td>${r.kind === "daily" ? "automática" : "manual"}</td>
        <td>${r.scannedChats}</td><td>${r.flashCalls}</td>
        <td>${r.silentReviewed ?? "—"}</td><td>${r.recorded}</td>
        <td>${
          r.geminiProposed == null
            ? "—"
            : `${r.geminiProposed} propuestos${r.geminiDroppedNoQuote ? ` · ${r.geminiDroppedNoQuote} sin cita real` : ""}${
                r.geminiErrors ? ` · <span class="noisy">${r.geminiErrors} fallaron</span>` : ""
              }`
        }</td>
      </tr>`
    )
    .join("");
  const learned = c.learned
    .map((x) => `<li>${escapeHtml(x.text)} <span class="muted">(${new Date(x.at).toLocaleDateString("es-MX")})</span></li>`)
    .join("");
  const lessonsList = q.lessons || [];
  const lessons = lessonsList
    .slice(0, 40)
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.date)}</td>
        <td>${escapeHtml(l.ref)}</td>
        <td>${escapeHtml(CATEGORY_LABEL[l.category] || l.category)}</td>
        <td>${escapeHtml(l.wrong)}</td>
        <td>${escapeHtml(l.right)}</td>
      </tr>`
    )
    .join("");
  body.innerHTML = `
    <h3>Errores por tipo (últimos ${q.windowDays} días)</h3>
    <p class="muted">«Falsas alarmas» = Cursor revisó y dijo que no era error. Si una regla pasa de 40% se marca ⚠ y conviene afinarla.</p>
    ${
      rules
        ? `<table><thead><tr><th>Tipo</th><th>Quién lo detectó</th><th>Total</th><th>Arreglados</th><th>Falsas alarmas</th><th>Pendientes</th><th>% falsas</th></tr></thead><tbody>${rules}</tbody></table>`
        : `<p class="muted">Sin hallazgos aún.</p>`
    }
    <h3>Cobertura de las auditorías</h3>
    ${
      runs
        ? `<table><thead><tr><th>Cuándo</th><th>Tipo</th><th>Chats revisados</th><th>Leídos por Gemini</th><th>Clientes que dejaron de contestar</th><th>Hallazgos</th><th>Respuestas de Gemini</th></tr></thead><tbody>${runs}</tbody></table>`
        : `<p class="muted">Aún no hay auditorías registradas con el nuevo reporte.</p>`
    }
    <h3>Cursor (últimos 30 días)</h3>
    <p>${c.jobs} envíos · ${c.published} publicados · ${c.failed} sin éxito${c.active ? ` · ${c.active} en curso` : ""}.
      Problemas: ${c.problemsFixed} arreglados, ${c.problemsFalsePositive} no eran error, ${c.problemsNotFixed} no pudo.
      2.º intentos: ${c.retries} (${c.retriesPublished} publicados).</p>
    <h3>Errores ya reparados que vigila el supervisor (${lessonsList.length})</h3>
    <p class="muted">Gemini recibe esta lista en cada revisión: si Lucy vuelve a cometer uno, lo reporta. Se suman solos los arreglos de Cursor publicados y los que hacemos a mano.</p>
    ${
      lessons
        ? `<table><thead><tr><th>Fecha</th><th>Origen</th><th>Tipo</th><th>Qué estaba mal</th><th>Qué hace ahora</th></tr></thead><tbody>${lessons}</tbody></table>`
        : `<p class="muted">Sin reparaciones registradas aún.</p>`
    }
    <h3>Reglas nuevas que aprendió el supervisor</h3>
    ${learned ? `<ul>${learned}</ul>` : `<p class="muted">Todavía ninguna: aparecen cuando Gemini encuentra un error nuevo y Cursor lo vuelve regla fija.</p>`}
  `;
}

async function refresh() {
  void loadQuality();
  await loadJobs();
  const s = await loadStats();
  const working = await loadWorkingBanner();
  if (agentConfigured && hasLiveJob) workingBanner?.classList.add("hidden");
  await loadList();
  ensurePoll((s.in_progress ?? 0) > 0 || working.length > 0);
}

if (jobsListEl) {
  jobsListEl.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-job-act]");
    if (!btn) return;
    const id = btn.closest("[data-job-id]")?.dataset.jobId;
    if (!id) return;
    const act = btn.dataset.jobAct;
    if (act === "publish" && !confirm("¿Publicar este arreglo? Pasa a main y Lucy lo usa en unos minutos.")) return;
    if (act === "cancel" && !confirm("¿Cancelar / descartar este arreglo? Las reparaciones vuelven a Abiertas.")) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/reparaciones/jobs/${encodeURIComponent(id)}/${act}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.message || data.error || `Error (${res.status})`);
    } finally {
      btn.disabled = false;
      await refresh();
    }
  });
}

if (btnCleanup) {
  btnCleanup.addEventListener("click", async () => {
    btnCleanup.disabled = true;
    try {
      const res = await fetch("/api/reparaciones/cleanup", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.error || "No se pudo limpiar");
        return;
      }
      alert(
        `Limpieza lista (nada se borró, quedan en Descartadas):\n` +
          `· ${d.duplicates ?? 0} duplicados\n· ${d.retired ?? 0} falsos positivos de reglas viejas\n` +
          `· ${d.released ?? 0} devueltas a Abiertas (estaban «En Cursor» sin trabajo vivo)\n` +
          `· ${d.joined ?? 0} sumadas al arreglo en curso (mismo problema)\n` +
          `· ${d.covered ?? 0} cerradas: ya las cubre un arreglo publicado\n` +
          `· ${d.falsePositive ?? 0} descartadas: mismo falso positivo que Cursor ya revisó`
      );
    } finally {
      btnCleanup.disabled = false;
      await refresh();
    }
  });
}

function setProgressVisible(on) {
  progressEl.classList.toggle("hidden", !on);
}

function setBar(current, total) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  barFillEl.style.width = `${pct}%`;
  counterEl.textContent = `${current} / ${total}`;
}

function appendLiveFinding(ev) {
  const li = document.createElement("li");
  li.className = ev.severity === "error" ? "error" : ev.severity === "warn" ? "warn" : "";
  li.innerHTML = `<span class="tag">${escapeHtml(ev.category)}</span>Lead ${escapeHtml(ev.leadId)} · ${escapeHtml(ev.evidence)}`;
  liveFindingsEl.prepend(li);
  while (liveFindingsEl.children.length > 40) {
    liveFindingsEl.lastElementChild?.remove();
  }
}

function handleProgressEvent(ev) {
  if (!ev || typeof ev !== "object") return;
  if (ev.type === "phase") {
    phaseEl.textContent =
      ev.phase === "sync"
        ? "Sincronizando Kommo…"
        : ev.phase === "scan"
          ? "Leyendo chats…"
          : ev.phase === "done"
            ? "Listo"
            : ev.message || "…";
    detailEl.textContent = ev.message || "";
  } else if (ev.type === "sync") {
    phaseEl.textContent = "Sincronizando Kommo…";
    setBar(ev.current ?? 0, ev.total ?? 0);
    detailEl.textContent = ev.leadId
      ? `Lead ${ev.leadId} · sincronizados ${ev.synced ?? 0}`
      : `Sincronizados ${ev.synced ?? 0}`;
  } else if (ev.type === "chat") {
    phaseEl.textContent = "Leyendo chats…";
    setBar(ev.current ?? 0, ev.total ?? 0);
    detailEl.textContent = ev.ok
      ? `Lead ${ev.leadId} · sin errores · hallazgos ${ev.findings ?? 0} · Flash ${ev.flashCalls ?? 0}`
      : `Lead ${ev.leadId} · con hallazgos · total ${ev.findings ?? 0} · Flash ${ev.flashCalls ?? 0}`;
  } else if (ev.type === "finding") {
    appendLiveFinding(ev);
  } else if (ev.type === "error") {
    phaseEl.textContent = "Error";
    detailEl.textContent = ev.message || "falló la auditoría";
  } else if (ev.type === "result") {
    const r = ev.result ?? {};
    phaseEl.textContent = r.findings > 0 ? "Hallazgos encontrados" : "Sin errores";
    setBar(r.scanned ?? 0, r.scanned ?? 0);
    detailEl.textContent =
      r.summary ||
      `${r.scanned ?? 0} chats · sync ${r.syncedFromKommo ?? 0} · ${r.recorded ?? 0} registradas · Flash ${r.flashCalls ?? 0}`;
  }
}

async function runAuditWithProgress() {
  setProgressVisible(true);
  liveFindingsEl.innerHTML = "";
  setBar(0, 0);
  phaseEl.textContent = "Iniciando…";
  detailEl.textContent = "Conectando con el auditor…";

  const res = await fetch("/api/reparaciones/run-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      limitLeads: 80,
      onlyToday: true,
      syncFromKommo: true,
      useFlash: true,
      forceFlash: true,
    }),
  });

  if (res.status === 401) {
    const cron = await fetch("/api/reparaciones/cron", { method: "POST" }).then((r) => r.json());
    handleProgressEvent({
      type: "result",
      result: cron,
    });
    return cron;
  }

  if (!res.ok || !res.body) {
    const fallback = await fetch("/api/reparaciones/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limitLeads: 80,
        onlyToday: true,
        syncFromKommo: true,
        useFlash: true,
        forceFlash: true,
      }),
    }).then((r) => r.json());
    if (fallback.error) throw new Error(fallback.error);
    handleProgressEvent({ type: "result", result: fallback });
    return fallback;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const chunk of parts) {
      const line = chunk
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim());
        handleProgressEvent(ev);
        if (ev.type === "result") lastResult = ev.result;
        if (ev.type === "error") throw new Error(ev.message || "audit_failed");
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }

  return lastResult;
}

listEl.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const id = card?.dataset.id;
  if (!id) return;
  const act = btn.dataset.act;
  if (act === "cursor") {
    btn.disabled = true;
    try {
      await sendToCursor(id);
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (act === "resolve") {
    const note = window.prompt(
      "Describe qué se arregló (queda en Resueltas):",
      "Fix aplicado en código Lucy: "
    );
    if (note == null) return;
    const applied = note.trim();
    if (!applied) {
      alert("Necesitas una descripción de qué se arregló.");
      return;
    }
    const res = await fetch(`/api/reparaciones/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedRepair: applied, resolvedBy: "panel" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || data.error || "No se pudo marcar hecha");
      return;
    }
    await refresh();
    return;
  }
  if (act === "dismiss") {
    const res = await fetch(`/api/reparaciones/${id}/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 401) {
      alert("Necesitas sesión del panel para descartar.");
      return;
    }
    if (!res.ok) {
      alert("No se pudo actualizar");
      return;
    }
    await refresh();
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentStatus = chip.dataset.status ?? "open";
    void loadList();
  });
});

if (btnGotoProgress) {
  btnGotoProgress.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.status === "in_progress");
    });
    currentStatus = "in_progress";
    void loadList();
  });
}

btnRefresh.addEventListener("click", () => void refresh());

if (btnSendCursor) {
  btnSendCursor.addEventListener("click", async () => {
    btnSendCursor.disabled = true;
    const prev = btnSendCursor.textContent;
    btnSendCursor.textContent = "Enviando…";
    try {
      await sendToCursor();
    } finally {
      btnSendCursor.disabled = false;
      btnSendCursor.textContent = prev || "Enviar a Cursor";
    }
  });
}

btnRun.addEventListener("click", async () => {
  btnRun.disabled = true;
  btnRun.textContent = "Auditando…";
  try {
    await runAuditWithProgress();
    await refresh();
  } catch (err) {
    phaseEl.textContent = "Error";
    detailEl.textContent = err.message || "Error al auditar";
    setProgressVisible(true);
  } finally {
    btnRun.disabled = false;
    btnRun.textContent = "Auditar ahora";
  }
});

refresh().catch(() => {
  emptyEl.textContent = "No se pudo cargar /api/reparaciones";
  emptyEl.classList.remove("hidden");
});
