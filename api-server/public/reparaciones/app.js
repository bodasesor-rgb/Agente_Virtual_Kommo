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

let currentStatus = "open";

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
  alert(
    data.sent
      ? `Enviado a Cursor: ${data.sent} hallazgo(s). El agente cloud debería abrir un run/PR.`
      : data.message || "Sin hallazgos para enviar"
  );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadStats() {
  const s = await fetch("/api/reparaciones/stats").then((r) => r.json());
  document.getElementById("stat-open").textContent = String(s.open ?? 0);
  document.getElementById("stat-flagged").textContent = String(s.auto_flagged ?? 0);
  document.getElementById("stat-resolved").textContent = String(s.resolved ?? 0);
  const model = String(s.auditor_model ?? "—");
  document.getElementById("stat-model").textContent = model;
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
}

function cardHtml(r) {
  const sev = r.severity === "error" ? "error" : r.severity === "warn" ? "warn" : "";
  const lead = r.kommoLeadId ? `Lead ${escapeHtml(r.kommoLeadId)}` : "Sin lead";
  const canAct = r.status === "open" || r.status === "auto_flagged";
  return `
    <article class="card" data-id="${escapeHtml(r.id)}">
      <div class="card-top">
        <div class="badges">
          <span class="badge ${sev}">${escapeHtml(r.severity)}</span>
          <span class="badge">${escapeHtml(r.category)}</span>
          <span class="badge">${escapeHtml(r.source)}</span>
          <span class="badge">${escapeHtml(r.status)}</span>
        </div>
        <span class="muted">${lead} · ${new Date(r.createdAt).toLocaleString("es-MX")}</span>
      </div>
      <h3>Evidencia</h3>
      <p>${escapeHtml(r.evidence)}</p>
      <div class="repair">
        <strong>Reparación propuesta</strong>
        <p>${escapeHtml(r.proposedRepair)}</p>
        ${r.appliedRepair ? `<p class="muted">Aplicada: ${escapeHtml(r.appliedRepair)}</p>` : ""}
      </div>
      ${
        canAct
          ? `<div class="actions">
              <button type="button" class="btn-sm ok" data-act="resolve">Marcar hecha</button>
              <button type="button" class="btn-sm mute" data-act="dismiss">Descartar</button>
              <button type="button" class="btn-sm" data-act="cursor">Enviar a Cursor</button>
            </div>`
          : ""
      }
    </article>`;
}

async function loadList() {
  const data = await fetch(`/api/reparaciones?status=${encodeURIComponent(currentStatus)}`).then(
    (r) => r.json()
  );
  const repairs = data.repairs ?? [];
  listEl.innerHTML = repairs.map(cardHtml).join("");
  emptyEl.classList.toggle("hidden", repairs.length > 0);
}

async function refresh() {
  await loadStats();
  await loadList();
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
    // Fallback sin stream
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
  const path =
    act === "resolve"
      ? `/api/reparaciones/${id}/resolve`
      : `/api/reparaciones/${id}/dismiss`;
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      act === "resolve" ? { appliedRepair: "Confirmado en panel Reparaciones" } : {}
    ),
  });
  if (res.status === 401) {
    alert("Necesitas sesión del panel para marcar / descartar.");
    return;
  }
  if (!res.ok) {
    alert("No se pudo actualizar");
    return;
  }
  await refresh();
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentStatus = chip.dataset.status ?? "open";
    void loadList();
  });
});

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
