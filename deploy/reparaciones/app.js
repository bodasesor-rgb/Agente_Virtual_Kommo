const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const btnRun = document.getElementById("btn-run");
const btnRefresh = document.getElementById("btn-refresh");
const modelEl = document.getElementById("auditor-model");

let currentStatus = "open";

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

listEl.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const id = card?.dataset.id;
  if (!id) return;
  const act = btn.dataset.act;
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

btnRun.addEventListener("click", async () => {
  btnRun.disabled = true;
  btnRun.textContent = "Auditando…";
  try {
    const res = await fetch("/api/reparaciones/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limitLeads: 12 }),
    });
    if (res.status === 401) {
      // Cron público existe; para panel sin login usamos cron
      const cron = await fetch("/api/reparaciones/cron", { method: "POST" }).then((r) =>
        r.json()
      );
      alert(
        `Auditoría (cron): ${cron.scanned ?? 0} chats · ${cron.recorded ?? 0} registradas · Flash ${cron.flashCalls ?? 0}`
      );
    } else {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falló");
      alert(
        `Auditoría: ${data.scanned} chats · ${data.recorded} registradas · Flash ${data.flashCalls}`
      );
    }
    await refresh();
  } catch (err) {
    alert(err.message || "Error al auditar");
  } finally {
    btnRun.disabled = false;
    btnRun.textContent = "Auditar ahora";
  }
});

refresh().catch(() => {
  emptyEl.textContent = "No se pudo cargar /api/reparaciones";
  emptyEl.classList.remove("hidden");
});
