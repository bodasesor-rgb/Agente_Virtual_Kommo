const API = "/api";
const TOKEN_KEY = "lucy_admin_token";

const loginView = document.getElementById("login-view");
const mainView = document.getElementById("main-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userLabel = document.getElementById("user-label");
const examplesList = document.getElementById("examples-list");
const analyticsCards = document.getElementById("analytics-cards");
const analyticsLeads = document.getElementById("analytics-leads");
const healthJson = document.getElementById("health-json");
const exampleDialog = document.getElementById("example-dialog");
const exampleForm = document.getElementById("example-form");
const learningList = document.getElementById("learning-list");
const learningStats = document.getElementById("learning-stats");
const learningDialog = document.getElementById("learning-dialog");
const learningForm = document.getElementById("learning-form");

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
  userLabel.textContent = user ? ` · ${user.name} (${user.role})` : "";
}

async function tryRestoreSession() {
  if (!token()) return showLogin();
  try {
    const data = await api("/auth/me");
    showMain(data.user);
    await loadExamples();
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
    await loadExamples();
  } catch (err) {
    loginError.textContent = "Credenciales inválidas o servidor sin SESSION_SECRET";
    loginError.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  setToken(null);
  showLogin();
});

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    document.getElementById(`tab-${tab}`).classList.remove("hidden");
    if (tab === "examples") await loadExamples();
    if (tab === "learning") await loadLearning();
    if (tab === "analytics") await loadAnalytics();
    if (tab === "system") await loadHealth();
  });
});

async function loadExamples() {
  const data = await api("/examples");
  examplesList.innerHTML = "";
  for (const ex of data.examples || []) {
    const div = document.createElement("div");
    div.className = "example-item";
    div.innerHTML = `
      <h4>${escapeHtml(ex.label || "Sin etiqueta")}</h4>
      <p><strong>Cliente:</strong> ${escapeHtml(ex.userMessage)}</p>
      <p><strong>Lucy:</strong> ${escapeHtml(ex.lucyResponse.slice(0, 280))}${ex.lucyResponse.length > 280 ? "…" : ""}</p>
      <div class="example-actions">
        <button type="button" data-edit="${ex.id}">Editar</button>
        <button type="button" class="ghost" data-del="${ex.id}">Eliminar</button>
      </div>`;
    examplesList.appendChild(div);
  }

  examplesList.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEdit(btn.dataset.edit, data.examples));
  });
  examplesList.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => deleteExample(btn.dataset.del));
  });
}

function openEdit(id, examples) {
  const ex = examples.find((e) => e.id === id);
  if (!ex) return;
  document.getElementById("dialog-title").textContent = "Editar ejemplo";
  document.getElementById("example-id").value = ex.id;
  document.getElementById("example-label").value = ex.label || "";
  document.getElementById("example-user").value = ex.userMessage;
  document.getElementById("example-lucy").value = ex.lucyResponse;
  exampleDialog.showModal();
}

document.getElementById("new-example-btn").addEventListener("click", () => {
  document.getElementById("dialog-title").textContent = "Nuevo ejemplo";
  document.getElementById("example-id").value = "";
  document.getElementById("example-label").value = "";
  document.getElementById("example-user").value = "";
  document.getElementById("example-lucy").value = "";
  exampleDialog.showModal();
});

document.getElementById("dialog-cancel").addEventListener("click", () => exampleDialog.close());

exampleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("example-id").value;
  const body = {
    label: document.getElementById("example-label").value,
    userMessage: document.getElementById("example-user").value,
    lucyResponse: document.getElementById("example-lucy").value,
  };
  if (id) {
    await api(`/examples/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  } else {
    await api("/examples", { method: "POST", body: JSON.stringify(body) });
  }
  exampleDialog.close();
  await loadExamples();
});

async function deleteExample(id) {
  if (!confirm("¿Eliminar este ejemplo?")) return;
  await api(`/examples/${id}`, { method: "DELETE" });
  await loadExamples();
}

async function loadLearning() {
  const stats = await api("/learning/stats");
  learningStats.innerHTML = `
    <div class="stat-card"><span class="muted">Pendientes</span><strong>${stats.pending ?? 0}</strong></div>
    <div class="stat-card"><span class="muted">Aprobados</span><strong>${stats.approved ?? 0}</strong></div>
    <div class="stat-card"><span class="muted">Descartados</span><strong>${stats.rejected ?? 0}</strong></div>`;

  const data = await api("/learning/candidates?status=pending&limit=30");
  learningList.innerHTML = "";
  for (const c of data.candidates || []) {
    const div = document.createElement("div");
    div.className = "example-item";
    div.innerHTML = `
      <h4>${escapeHtml(c.label || "Sin etiqueta")} <span class="badge pending">lead ${escapeHtml(c.kommoLeadId)}</span></h4>
      <p><strong>Cliente:</strong> ${escapeHtml(c.userMessage)}</p>
      <p><strong>Respuesta humana → Lucy:</strong> ${escapeHtml(c.suggestedResponse.slice(0, 300))}${c.suggestedResponse.length > 300 ? "…" : ""}</p>
      <div class="example-actions">
        <button type="button" data-review="${c.id}">Revisar</button>
        <button type="button" class="ghost" data-reject="${c.id}">Descartar</button>
      </div>`;
    learningList.appendChild(div);
  }

  learningList.querySelectorAll("[data-review]").forEach((btn) => {
    btn.addEventListener("click", () => openLearningReview(btn.dataset.review, data.candidates));
  });
  learningList.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", () => rejectLearning(btn.dataset.reject));
  });
}

function openLearningReview(id, candidates) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  document.getElementById("learning-id").value = c.id;
  document.getElementById("learning-label").value = c.label || "";
  document.getElementById("learning-user").value = c.userMessage;
  document.getElementById("learning-response").value = c.suggestedResponse;
  document.getElementById("learning-context").textContent = c.contextSnippet
    ? `Contexto: ${c.contextSnippet}`
    : "";
  learningDialog.showModal();
}

document.getElementById("learning-cancel").addEventListener("click", () => learningDialog.close());
document.getElementById("learning-reject").addEventListener("click", async () => {
  const id = document.getElementById("learning-id").value;
  if (!id) return;
  await rejectLearning(id);
  learningDialog.close();
});

learningForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("learning-id").value;
  await api(`/learning/candidates/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({
      label: document.getElementById("learning-label").value,
      userMessage: document.getElementById("learning-user").value,
      suggestedResponse: document.getElementById("learning-response").value,
    }),
  });
  learningDialog.close();
  await loadLearning();
});

async function rejectLearning(id) {
  if (!confirm("¿Descartar este aprendizaje?")) return;
  await api(`/learning/candidates/${id}/reject`, { method: "POST" });
  await loadLearning();
}

async function loadAnalytics() {
  const overview = await api("/analytics/overview");
  analyticsCards.innerHTML = `
    <div class="stat-card"><span class="muted">Conversaciones</span><strong>${overview.totalConversations ?? 0}</strong></div>
    <div class="stat-card"><span class="muted">Hot leads</span><strong>${overview.leadsByPriority?.hot ?? 0}</strong></div>
    <div class="stat-card"><span class="muted">Warm</span><strong>${overview.leadsByPriority?.warm ?? 0}</strong></div>
    <div class="stat-card"><span class="muted">Cold</span><strong>${overview.leadsByPriority?.cold ?? 0}</strong></div>`;

  const convs = await api("/analytics/conversations?limit=10");
  analyticsLeads.innerHTML = (convs.conversations || [])
    .map(
      (c) =>
        `<div class="example-item"><strong>${escapeHtml(c.clientName || c.kommoLeadId)}</strong>
         <span class="muted"> · ${escapeHtml(c.stage || "")} · score ${c.leadScore?.total ?? "-"}</span></div>`
    )
    .join("");
}

async function loadHealth() {
  const res = await fetch("/api/health");
  healthJson.textContent = JSON.stringify(await res.json(), null, 2);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

void tryRestoreSession();
