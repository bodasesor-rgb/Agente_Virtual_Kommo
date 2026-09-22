const overallCard = document.getElementById("overall-card");
const overallText = document.getElementById("overall-text");
const overallDetail = document.getElementById("overall-detail");
const checksGrid = document.getElementById("checks-grid");
const btnHeal = document.getElementById("btn-heal");
const btnRefresh = document.getElementById("btn-refresh");

const OVERALL_LABEL = {
  ok: "Lucy operando con normalidad",
  warn: "Hay avisos — revisa abajo",
  error: "Problemas detectados — usa Reparar",
};

const CHECK_ICON = { ok: "✓", warn: "!", error: "✕" };

async function loadStatus() {
  const res = await fetch("/api/ops/status");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (data.error) throw new Error(data.error);

  overallCard.className = `overall-card ${data.overall}`;
  overallText.textContent = OVERALL_LABEL[data.overall] ?? data.overall;
  overallDetail.textContent = [
    `prompt ${data.lucy_prompt ?? "?"}`,
    data.built_at_display ? `actualizado ${data.built_at_display}` : null,
    data.git_commit_short ? `commit ${data.git_commit_short}` : null,
    `${Math.floor(data.uptime ?? 0)}s en línea`,
  ]
    .filter(Boolean)
    .join(" · ");

  checksGrid.innerHTML = (data.checks ?? [])
    .map(
      (c) => `
    <div class="check-row ${c.status}">
      <span class="check-icon">${CHECK_ICON[c.status] ?? "?"}</span>
      <div class="check-body">
        <strong>${escapeHtml(c.label)}</strong>
        <span>${escapeHtml(c.detail)}</span>
      </div>
    </div>`,
    )
    .join("");

  // Modelos reales desde API (sin IDs inventados en el HTML).
  const infoChat = document.getElementById("info-chat-model");
  const infoAuditor = document.getElementById("info-auditor-model");
  try {
    const [health, repairs] = await Promise.all([
      fetch("/api/health").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reparaciones/stats").then((r) => (r.ok ? r.json() : null)),
    ]);
    if (infoChat) {
      const last = health?.gemini_call_stats?.lastModel;
      const configured = health?.llm_model;
      infoChat.textContent =
        typeof last === "string" && last.trim()
          ? `última llamada ${last}`
          : typeof configured === "string" && configured.trim()
            ? configured
            : "sin dato del servidor";
    }
    if (infoAuditor) {
      const m = repairs?.auditor_model;
      infoAuditor.textContent =
        typeof m === "string" && m.trim() ? m : "sin dato del servidor";
    }
  } catch {
    if (infoChat) infoChat.textContent = "sin dato del servidor";
    if (infoAuditor) infoAuditor.textContent = "sin dato del servidor";
  }

  btnHeal.disabled = false;
  btnHeal.title = "Recargar catálogo del Sheet";
}

async function runHeal() {
  btnHeal.disabled = true;
  btnHeal.textContent = "Reparando…";
  try {
    const res = await fetch("/api/ops/heal", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.healed?.length) {
      overallText.textContent = `Reparado: ${data.healed.join(", ")}`;
    }
    await loadStatus();
  } catch (err) {
    alert(err.message || "Error al reparar");
  } finally {
    btnHeal.textContent = "Reparar ahora";
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

btnHeal.addEventListener("click", () => void runHeal());
btnRefresh.addEventListener("click", () => void loadStatus().catch(showError));

function showError(err) {
  overallCard.className = "overall-card error";
  overallText.textContent = "No se pudo conectar con Lucy";
  overallDetail.textContent = err.message;
}

loadStatus().catch(showError);
setInterval(() => loadStatus().catch(() => undefined), 60_000);
