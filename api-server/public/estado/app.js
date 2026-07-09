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
  const data = await fetch("/api/ops/status").then((r) => r.json());
  if (data.error) throw new Error(data.error);

  overallCard.className = `overall-card ${data.overall}`;
  overallText.textContent = OVERALL_LABEL[data.overall] ?? data.overall;
  overallDetail.textContent = `v${data.version ?? "?"} · ${Math.floor(data.uptime ?? 0)}s en línea`;

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

  btnHeal.disabled = !(data.healActions?.length > 0);
  btnHeal.title =
    data.healActions?.length > 0
      ? "Recargar catálogo del Sheet"
      : "No hay reparaciones automáticas pendientes";
}

async function runHeal() {
  btnHeal.disabled = true;
  btnHeal.textContent = "Reparando…";
  try {
    const data = await fetch("/api/ops/heal", { method: "POST" }).then((r) => r.json());
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
