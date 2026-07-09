const API = "/api";
const TOKEN_KEY = "lucy_admin_token";

const loginView = document.getElementById("login-view");
const mainView = document.getElementById("main-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userLabel = document.getElementById("user-label");
const statsRow = document.getElementById("stats-row");
const gapsList = document.getElementById("gaps-list");
const emptyState = document.getElementById("empty-state");

let currentStatus = "pending";

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    showLogin();
    throw new Error("Sesión expirada");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showLogin() {
  loginView.classList.remove("hidden");
  mainView.classList.add("hidden");
}

function showMain(user) {
  loginView.classList.add("hidden");
  mainView.classList.remove("hidden");
  userLabel.textContent = user ? ` · ${user.name}` : "";
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
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

async function loadStats() {
  const stats = await api("/knowledge-gaps/stats");
  statsRow.innerHTML = `
    <div class="stat-pill"><strong>${stats.pending}</strong>Pendientes</div>
    <div class="stat-pill"><strong>${stats.answered}</strong>Enseñadas a Lucy</div>
    <div class="stat-pill"><strong>${stats.dismissed}</strong>Descartadas</div>
  `;
}

async function loadGaps() {
  const data = await api(`/knowledge-gaps?status=${currentStatus}&limit=50`);
  gapsList.innerHTML = "";

  if (!data.gaps?.length) {
    emptyState.classList.remove("hidden");
    emptyState.textContent =
      currentStatus === "pending"
        ? "No hay preguntas pendientes. ¡Lucy está al día con el catálogo!"
        : "Aún no has enseñado respuestas desde aquí.";
    return;
  }

  emptyState.classList.add("hidden");

  for (const gap of data.gaps) {
    const card = document.createElement("article");
    card.className = `gap-card${currentStatus === "answered" ? " answered" : ""}`;
    card.dataset.id = gap.id;

    const badgeClass = gap.gapType === "price" ? "gap-badge price" : "gap-badge";

    card.innerHTML = `
      <div class="gap-header">
        <span class="gap-topic">${escapeHtml(gap.topic || "Pregunta del cliente")}</span>
        <span class="${badgeClass}">${escapeHtml(gapTypeLabel(gap.gapType))}</span>
      </div>
      <div class="question-block">
        <div class="label">Cliente preguntó</div>
        <div>${escapeHtml(gap.question)}</div>
      </div>
      ${
        gap.lucyResponse
          ? `<div class="lucy-hint"><strong>Lucy respondió (sin datos en catálogo):</strong> ${escapeHtml(gap.lucyResponse.slice(0, 280))}${gap.lucyResponse.length > 280 ? "…" : ""}</div>`
          : ""
      }
      ${
        currentStatus === "pending"
          ? `
        <label>Tu respuesta — Lucy aprenderá esto
          <textarea class="answer-box" data-answer placeholder="Ej: El DJ desde $8,500 por 4 horas, incluye equipo básico. Alejandro confirma según el evento."></textarea>
        </label>
        <div class="gap-actions">
          <button type="button" class="save-btn">Guardar y enseñar a Lucy</button>
          <button type="button" class="ghost dismiss-btn">Descartar</button>
        </div>`
          : `
        <div class="answer-display">
          <div class="label">Respuesta enseñada</div>
          ${escapeHtml(gap.answer || "")}
        </div>`
      }
      <div class="meta">${gap.kommoLeadId ? `Lead ${gap.kommoLeadId} · ` : ""}${formatDate(gap.createdAt)}</div>
    `;

    if (currentStatus === "pending") {
      card.querySelector(".save-btn")?.addEventListener("click", () => saveAnswer(gap.id, card));
      card.querySelector(".dismiss-btn")?.addEventListener("click", () => dismissGap(gap.id));
    }

    gapsList.appendChild(card);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  await loadStats();
  await loadGaps();
}

async function tryRestoreSession() {
  if (!token()) return showLogin();
  try {
    const data = await api("/auth/me");
    showMain(data.user);
    await refresh();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    showMain(data.user);
    await refresh();
  } catch {
    loginError.textContent = "Credenciales inválidas";
    loginError.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  setToken(null);
  showLogin();
});

document.querySelectorAll(".filter-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".filter-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status;
    await loadGaps();
  });
});

tryRestoreSession();
