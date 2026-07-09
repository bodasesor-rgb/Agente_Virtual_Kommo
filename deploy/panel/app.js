const VIEWS = {
  home: { frame: null },
  simulador: { frame: "/simulator", title: "Simulador" },
  aprendizaje: { frame: "/aprendizaje", title: "Aprendizaje de Lucy" },
};

const viewHome = document.getElementById("view-home");
const viewFrame = document.getElementById("view-frame");
const appFrame = document.getElementById("app-frame");
const homeStats = document.getElementById("home-stats");

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
    history.replaceState({ view: viewId }, "", `/panel${viewId === "home" ? "" : `#${viewId}`}`);
    return;
  }

  viewHome.classList.add("hidden");
  viewFrame.classList.remove("hidden");
  if (appFrame.src !== new URL(config.frame, window.location.origin).href) {
    appFrame.src = config.frame;
  }
  history.replaceState({ view: viewId }, "", `/panel#${viewId}`);
}

function parseHash() {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash === "simulador" || hash === "aprendizaje") return hash;
  return "home";
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

document.querySelectorAll("[data-go]").forEach((card) => {
  card.addEventListener("click", () => showView(card.dataset.go));
});

async function loadHomeStats() {
  try {
    const health = await fetch("/api/health").then((r) => r.json());
    const catalog = health.catalog ?? {};
    let pendingGaps = "—";
    try {
      const token = localStorage.getItem("lucy_admin_token");
      if (token) {
        const gaps = await fetch("/api/knowledge-gaps/stats", {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : null));
        if (gaps) pendingGaps = String(gaps.pending ?? 0);
      }
    } catch {
      /* sin login aún */
    }

    homeStats.innerHTML = `
      <div class="stat-card">
        <strong>${health.openai_configured ? "OK" : "—"}</strong>
        OpenAI
      </div>
      <div class="stat-card">
        <strong>${catalog.pricedServicesCount ?? 0}</strong>
        Precios en catálogo
      </div>
      <div class="stat-card">
        <strong>${pendingGaps}</strong>
        Preguntas pendientes
      </div>
      <div class="stat-card">
        <strong>v${health.version ?? "?"}</strong>
        Lucy ${health.lucy_prompt ?? ""}
      </div>
    `;
  } catch {
    homeStats.innerHTML = `<div class="stat-card muted">No se pudo cargar el estado del servidor.</div>`;
  }
}

window.addEventListener("hashchange", () => showView(parseHash()));
window.addEventListener("popstate", () => showView(parseHash()));

showView(parseHash());
loadHomeStats();
