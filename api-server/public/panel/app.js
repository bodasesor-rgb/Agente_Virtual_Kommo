const VIEWS = {
  home: { frame: null, title: "Panel general" },
  simulador: { frame: "/simulator", title: "Simulador para pruebas de Lucy" },
  aprendizaje: { frame: "/aprendizaje", title: "Aprendizaje de Lucy" },
  "aprendizaje-info": {
    frame: "/aprendizaje/?tab=info",
    title: "Información para Lucy — PDFs y tips",
  },
  reparaciones: { frame: "/reparaciones", title: "Reparaciones Lucy" },
  estado: { frame: "/estado", title: "Estado de Lucy" },
};

const viewHome = document.getElementById("view-home");
const viewFrame = document.getElementById("view-frame");
const appFrame = document.getElementById("app-frame");
const homeStats = document.getElementById("home-stats");
const heroStatus = document.getElementById("hero-status");
const frameTitle = document.getElementById("frame-title");

function setActiveNav(viewId) {
  const navId = viewId === "aprendizaje-info" ? "aprendizaje" : viewId;
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === navId);
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
    return;
  }

  viewHome.classList.add("hidden");
  viewFrame.classList.remove("hidden");
  frameTitle.textContent = config.title;
  const nextSrc = new URL(config.frame, window.location.origin).href;
  // Forzar reload al cambiar entre Aprendizaje e Información (mismo path, distinto query).
  if (appFrame.src !== nextSrc) {
    appFrame.src = nextSrc;
  } else {
    try {
      appFrame.contentWindow?.location?.reload();
    } catch {
      appFrame.src = nextSrc;
    }
  }
  history.replaceState({ view: viewId }, "", `/panel#${viewId}`);
}

function parseHash() {
  const hash = window.location.hash.replace("#", "").trim();
  if (
    hash === "simulador" ||
    hash === "aprendizaje" ||
    hash === "aprendizaje-info" ||
    hash === "reparaciones" ||
    hash === "estado"
  ) {
    return hash;
  }
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
    const opsRes = await fetch("/api/ops/status");
    const ops = opsRes.ok ? await opsRes.json() : null;
    const catalog = health.catalog ?? {};
    let pendingGaps = "—";
    let gapsClass = "";
    let openRepairs = "—";
    let repairsClass = "";

    try {
      const gaps = await fetch("/api/knowledge-gaps/stats").then((r) =>
        r.ok ? r.json() : null,
      );
      if (gaps) {
        pendingGaps = String(gaps.pending ?? 0);
        gapsClass = gaps.pending > 0 ? "stat-warn" : "stat-ok";
      }
    } catch {
      /* stats opcionales */
    }

    let auditorModel = "—";
    try {
      const repairs = await fetch("/api/reparaciones/stats").then((r) =>
        r.ok ? r.json() : null,
      );
      if (repairs) {
        const n = (repairs.open ?? 0) + (repairs.auto_flagged ?? 0);
        openRepairs = String(n);
        repairsClass = n > 0 ? "stat-warn" : "stat-ok";
        if (repairs.auditor_model) auditorModel = String(repairs.auditor_model);
      }
    } catch {
      /* opcional */
    }

    const llmProvider = String(health.llm_provider ?? "").toLowerCase();
    const llmOk = Boolean(
      health.llm_configured ??
        (llmProvider === "gemini" ? health.gemini_configured : health.openai_configured),
    );
    const llmLabel =
      llmProvider === "gemini"
        ? "Gemini"
        : llmProvider === "openai"
          ? "OpenAI"
          : health.gemini_configured
            ? "Gemini"
            : "LLM";
    // Modelo real de chat (mismo que responde WhatsApp / Kommo).
    const chatModel =
      health.llm_model ||
      health.gemini_allowed_model ||
      (llmProvider === "gemini" ? "gemini-3.1-flash-lite" : "—");

    const cardRepairs = document.getElementById("card-reparaciones-desc");
    if (cardRepairs) {
      cardRepairs.textContent = `Auditor offline (${auditorModel}) que revisa chats: bucles, cierres mal, campos. Nunca escribe al cliente; solo propone/registra fixes.`;
    }

    const online = ops?.overall === "ok" || (health.status === "ok" && llmOk);
    const deployLabel = health.built_at_display
      ? `${health.lucy_prompt ?? "?"} · ${health.built_at_display}`
      : health.lucy_prompt ?? "?";
    const statusLabel =
      ops?.overall === "error"
        ? "Problemas detectados"
        : ops?.overall === "warn"
          ? "Avisos — revisar Estado"
          : online
            ? `Lucy activa · ${deployLabel}`
            : "Lucy necesita revisión";
    setHeroStatus(online && ops?.overall !== "error", statusLabel);

    homeStats.innerHTML = [
      statCard(
        "stat-icon-openai",
        "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
        chatModel,
        llmOk ? `Chat Lucy · ${llmLabel}` : `Chat Lucy · sin key`,
        llmOk ? "stat-ok" : "stat-warn",
      ),
      statCard(
        "stat-icon-gaps",
        "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
        auditorModel,
        "Auditor · Reparaciones",
        auditorModel !== "—" ? "stat-ok" : "stat-warn",
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
        "Preguntas pendientes",
        gapsClass,
      ),
      statCard(
        "stat-icon-gaps",
        "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
        openRepairs,
        "Reparaciones abiertas",
        repairsClass,
      ),
      statCard(
        "stat-icon-version",
        "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
        health.lucy_prompt ?? "V6",
        health.built_at_display
          ? `Prompt ${health.lucy_prompt ?? "?"} · ${health.built_at_display}`
          : `Versión ${health.version ?? "?"}`,
      ),
    ].join("");
  } catch {
    setHeroStatus(false, "Servidor no disponible");
    homeStats.innerHTML = `<div class="stat-card muted">No se pudo cargar el estado del servidor.</div>`;
  }
}

window.addEventListener("hashchange", () => showView(parseHash()));
window.addEventListener("popstate", () => showView(parseHash()));

showView(parseHash());
loadHomeStats();
