const VIEWS = {
  home: { frame: null, title: "Panel general" },
  simulador: { frame: "/simulator", title: "Simulador para pruebas de Lucy" },
  aprendizaje: { frame: "/aprendizaje", title: "Aprendizaje de Lucy" },
  estado: { frame: "/estado", title: "Estado de Lucy" },
};

const viewHome = document.getElementById("view-home");
const viewFrame = document.getElementById("view-frame");
const appFrame = document.getElementById("app-frame");
const homeStats = document.getElementById("home-stats");
const heroStatus = document.getElementById("hero-status");
const frameTitle = document.getElementById("frame-title");

function setActiveNav(viewId) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });
}

function showView(viewId) {
  const config = VIEWS[viewId] ?? VIEWS.home;
  setActiveNav(viewId);

  if (!config.frame) {
    viewHome.classList.remove("hidden");
    viewFrame.classList.add("hidden");
    appFrame.src = "about:blank";
    history.replaceState({ view: viewId }, "", viewId === "home" ? "/panel" : `/panel#${viewId}`);
    loadHomeStats();
    return;
  }

  viewHome.classList.add("hidden");
  viewFrame.classList.remove("hidden");
  frameTitle.textContent = config.title;
  const frameUrl = `${config.frame}${config.frame.includes("?") ? "&" : "?"}t=${Date.now()}`;
  appFrame.src = frameUrl;
  history.replaceState({ view: viewId }, "", `/panel#${viewId}`);
}

function parseHash() {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash === "simulador" || hash === "aprendizaje" || hash === "estado") return hash;
  return "home";
}

document.querySelectorAll(".nav-item, .frame-back").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

document.querySelectorAll("[data-go]").forEach((card) => {
  card.addEventListener("click", () => showView(card.dataset.go));
});

function setHeroStatus(ok, text) {
  heroStatus.className = `hero-badge ${ok ? "ok" : ok === false ? "err" : "warn"}`;
  heroStatus.innerHTML = `<span class="pulse-dot"></span>${text}`;
}

function statCard(iconClass, iconPath, value, label, extraClass = "") {
  return `
    <div class="stat-card ${extraClass}">
      <div class="stat-icon ${iconClass}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPath}"/></svg>
      </div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

async function loadHomeStats() {
  try {
    const health = await fetch("/api/health").then((r) => r.json());
    const ops = await fetch("/api/ops/status").then((r) => (r.ok ? r.json() : null));
    const catalog = health.catalog ?? {};
    let pendingGaps = "—";
    let panelTaught = "—";
    let gapsClass = "";

    try {
      const overview = await fetch("/api/knowledge-gaps/overview").then((r) =>
        r.ok ? r.json() : null,
      );
      if (overview?.gaps) {
        pendingGaps = String(overview.gaps.pending ?? 0);
        gapsClass = overview.gaps.pending > 0 ? "stat-warn" : "stat-ok";
      }
      if (overview?.training) {
        panelTaught = String(overview.training.panelTaught ?? 0);
      }
    } catch {
      /* stats opcionales */
    }

    const online = ops?.overall === "ok" || (health.status === "ok" && health.openai_configured);
    const statusLabel =
      ops?.overall === "error"
        ? "Problemas detectados"
        : ops?.overall === "warn"
          ? "Avisos — revisar Estado"
          : online
            ? `Lucy activa · v${health.version ?? "?"}`
            : "Lucy necesita revisión";
    setHeroStatus(online && ops?.overall !== "error", statusLabel);

    homeStats.innerHTML = [
      statCard(
        "stat-icon-openai",
        "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
        health.openai_configured ? "Conectada" : "Sin key",
        "OpenAI",
        health.openai_configured ? "stat-ok" : "stat-warn",
      ),
      statCard(
        "stat-icon-catalog",
        "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
        catalog.pricedServicesCount ?? 0,
        "Precios en catálogo",
      ),
      statCard(
        "stat-icon-gaps",
        "M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z",
        pendingGaps,
        "Pendientes de enseñar",
        gapsClass,
      ),
      statCard(
        "stat-icon-learn",
        "M12 3 1 9l4 2.18V17l7 3.82 7-3.82v-5.82L23 9 12 3zm0 2.18L18.9 9 12 12.18 5.1 9 12 5.18zM5 17.27l7 3.82 7-3.82v-3.1L12 17l-7-2.83v3.1z",
        panelTaught,
        "En uso por Lucy",
        Number(panelTaught) > 0 ? "stat-ok" : "",
      ),
      statCard(
        "stat-icon-version",
        "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
        health.lucy_prompt ?? "V6",
        `Versión ${health.version ?? "?"}`,
      ),
    ].join("");
  } catch {
    setHeroStatus(false, "Servidor no disponible");
    homeStats.innerHTML = `<div class="stat-card muted">No se pudo cargar el estado del servidor.</div>`;
  }
}

window.addEventListener("hashchange", () => showView(parseHash()));
window.addEventListener("popstate", () => showView(parseHash()));

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "lucy-learning-updated") {
    loadHomeStats();
  }
});

showView(parseHash());
loadHomeStats();
