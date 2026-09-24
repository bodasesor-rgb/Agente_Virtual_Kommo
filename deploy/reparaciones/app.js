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

let currentStatus = "open";
let pollTimer = null;

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
  if (res.status === 503) {
    alert(
      data.message ||
        "Falta CURSOR_REPAIR_WEBHOOK_URL en Hostinger. Guarda la Automation en Cursor y pega la URL del webhook."
    );
    return;
  }
  if (!res.ok) {
    alert(data.message || data.error || `Error al enviar (${res.status})`);
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
        <p class="muted">El agente cloud está aplicando la reparación propuesta. Cuando termine, quedará marcada como hecha con la descripción del fix.</p>
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
                  ? `<button type="button" class="btn-sm" data-act="cursor">Enviar a Cursor</button>`
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

async function refresh(opts = {}) {
  const s = await loadStats();
  const working = await loadWorkingBanner();
  await loadList();
  ensurePoll((s.in_progress ?? 0) > 0 || working.length > 0);
  if (!opts.quiet && modelEl) {
    /* no-op */
  }
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
      limitLeads: 50,
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
        limitLeads: 50,
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
