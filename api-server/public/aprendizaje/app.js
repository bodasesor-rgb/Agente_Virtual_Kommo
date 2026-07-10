const API = "/api";

const sectionIntro = document.getElementById("section-intro");
const statsRow = document.getElementById("stats-row");
const gapsList = document.getElementById("gaps-list");
const emptyState = document.getElementById("empty-state");

let currentStatus = "pending";

const INTRO = {
  pending:
    "Estas son preguntas de clientes reales donde <strong>Lucy no encontró precio o servicio en el catálogo</strong>. Escribe la respuesta correcta y Lucy la usará en futuras conversaciones.",
  answered:
    "Todo lo que <strong>ya le enseñaste a Lucy</strong>: la pregunta del cliente, lo que Lucy dijo sin datos, y la respuesta correcta que quedó guardada.",
  training:
    "Estos son los <strong>ejemplos que Lucy ya usa en sus conversaciones</strong> (few-shot). Cada vez que enseñas una respuesta en «No sabe», aparece aquí en unos segundos.",
};

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "medium",
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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateTabCounts(stats, trainingTotal = 0) {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const key = el.dataset.count;
    if (key === "training") {
      el.textContent = String(trainingTotal);
    } else if (key && stats[key] !== undefined) {
      el.textContent = String(stats[key]);
    }
  });
}

async function loadStats() {
  const [stats, trainingData] = await Promise.all([
    api("/knowledge-gaps/stats"),
    api("/knowledge-gaps/training-recent?limit=1").catch(() => ({ stats: { total: 0 } })),
  ]);
  const total = stats.pending + stats.answered + stats.dismissed;
  const trainingTotal = trainingData.stats?.total ?? 0;

  statsRow.innerHTML = `
    <div class="stat-card pending">
      <strong>${stats.pending}</strong>
      <span>No sabe — pendientes</span>
    </div>
    <div class="stat-card learned">
      <strong>${stats.answered}</strong>
      <span>Ya aprendió</span>
    </div>
    <div class="stat-card total">
      <strong>${trainingTotal}</strong>
      <span>En uso por Lucy</span>
    </div>
    <div class="stat-card dismissed">
      <strong>${total}</strong>
      <span>Total registradas</span>
    </div>
  `;

  updateTabCounts(stats, trainingTotal);
}

function renderPendingCard(gap) {
  const card = document.createElement("article");
  card.className = "gap-card pending-card";
  card.dataset.id = gap.id;

  const badgeClass = gap.gapType === "price" ? "gap-badge price" : "gap-badge";

  card.innerHTML = `
    <div class="gap-top">
      <div>
        <div class="gap-topic">${escapeHtml(gap.topic || "Sin tema en catálogo")}</div>
      </div>
      <div class="gap-badges">
        <span class="gap-badge pending">Pendiente</span>
        <span class="${badgeClass}">${escapeHtml(gapTypeLabel(gap.gapType))}</span>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block question">
        <div class="label">Cliente preguntó</div>
        <div class="value">${escapeHtml(gap.question)}</div>
      </div>
      <div class="info-block lucy-said">
        <div class="label">Lucy respondió (sin dato en catálogo)</div>
        <div class="value">${escapeHtml(gap.lucyResponse || "— Aún no respondió en el chat —")}</div>
      </div>
    </div>
    ${
      gap.contextSnippet
        ? `<div class="info-block" style="border-top:1px solid var(--border);background:#fff">
            <div class="label">Contexto de la conversación</div>
            <div class="value">${escapeHtml(gap.contextSnippet)}</div>
          </div>`
        : ""
    }
    <div class="answer-form">
      <label>Tu respuesta — esto es lo que Lucy aprenderá
        <textarea class="answer-box" data-answer placeholder="Ej: El DJ desde $8,500 por 4 horas, incluye equipo básico. Alejandro confirma según el evento."></textarea>
      </label>
      <div class="gap-actions">
        <button type="button" class="btn-save save-btn">Guardar y enseñar a Lucy</button>
        <button type="button" class="btn-ghost dismiss-btn">Descartar</button>
      </div>
    </div>
    <div class="gap-footer">
      <span>${gap.kommoLeadId ? `Lead Kommo #${escapeHtml(gap.kommoLeadId)}` : "Sin lead vinculado"}</span>
      <span>Detectado: ${formatDate(gap.createdAt)}</span>
    </div>
  `;

  card.querySelector(".save-btn")?.addEventListener("click", () => saveAnswer(gap.id, card));
  card.querySelector(".dismiss-btn")?.addEventListener("click", () => dismissGap(gap.id));

  return card;
}

function renderLearnedCard(gap) {
  const card = document.createElement("article");
  card.className = "gap-card learned-card";
  card.dataset.id = gap.id;

  const badgeClass = gap.gapType === "price" ? "gap-badge price" : "gap-badge";

  card.innerHTML = `
    <div class="gap-top">
      <div>
        <div class="gap-topic">${escapeHtml(gap.topic || "Conocimiento enseñado")}</div>
      </div>
      <div class="gap-badges">
        <span class="gap-badge learned">Aprendido</span>
        <span class="${badgeClass}">${escapeHtml(gapTypeLabel(gap.gapType))}</span>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block question">
        <div class="label">Pregunta del cliente</div>
        <div class="value">${escapeHtml(gap.question)}</div>
      </div>
      <div class="info-block lucy-said">
        <div class="label">Lo que Lucy dijo antes</div>
        <div class="value">${escapeHtml(gap.lucyResponse || "—")}</div>
      </div>
      <div class="info-block answer">
        <div class="label">Respuesta enseñada (lo que Lucy usa ahora)</div>
        <div class="value">${escapeHtml(gap.answer || "—")}</div>
      </div>
    </div>
    <div class="gap-footer">
      <span>${gap.answeredBy ? `Enseñado por ${escapeHtml(gap.answeredBy)}` : "Enseñado desde el panel"}</span>
      <span>${formatDate(gap.answeredAt)}${gap.kommoLeadId ? ` · Lead #${escapeHtml(gap.kommoLeadId)}` : ""}</span>
    </div>
  `;

  return card;
}

function renderTrainingCard(example) {
  const card = document.createElement("article");
  card.className = "gap-card learned-card";
  card.dataset.id = example.id;

  card.innerHTML = `
    <div class="gap-top">
      <div>
        <div class="gap-topic">${escapeHtml(example.label || "Ejemplo activo")}</div>
      </div>
      <div class="gap-badges">
        <span class="gap-badge learned">Activo</span>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block question">
        <div class="label">Si el cliente dice…</div>
        <div class="value">${escapeHtml(example.userMessage)}</div>
      </div>
      <div class="info-block answer">
        <div class="label">Lucy responde así</div>
        <div class="value">${escapeHtml(example.lucyResponse)}</div>
      </div>
    </div>
    <div class="gap-footer">
      <span>En uso en conversaciones</span>
      <span>${formatDate(example.createdAt)}</span>
    </div>
  `;

  return card;
}

async function loadGaps() {
  sectionIntro.innerHTML = INTRO[currentStatus] ?? "";
  gapsList.innerHTML = "";

  if (currentStatus === "training") {
    const data = await api("/knowledge-gaps/training-recent?limit=50");
    if (!data.examples?.length) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `<strong>Aún no hay ejemplos activos</strong>Cuando enseñes una respuesta en la pestaña «No sabe», aparecerá aquí como ejemplo que Lucy usa en chat.`;
      return;
    }
    emptyState.classList.add("hidden");
    for (const ex of data.examples) {
      gapsList.appendChild(renderTrainingCard(ex));
    }
    return;
  }

  const data = await api(`/knowledge-gaps?status=${currentStatus}&limit=50`);

  if (!data.gaps?.length) {
    emptyState.classList.remove("hidden");
    emptyState.innerHTML =
      currentStatus === "pending"
        ? `<strong>No hay preguntas pendientes</strong>Lucy está al día con el catálogo del Sheet. Cuando un cliente pregunte algo sin precio o Lucy ignore un servicio, aparecerá aquí.`
        : `<strong>Aún no hay aprendizajes guardados</strong>Cuando enseñes una respuesta en la pestaña «No sabe», aparecerá aquí con la pregunta y la respuesta correcta.`;
    return;
  }

  emptyState.classList.add("hidden");

  for (const gap of data.gaps) {
    gapsList.appendChild(
      currentStatus === "pending" ? renderPendingCard(gap) : renderLearnedCard(gap),
    );
  }
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
    // Mostrar pestaña "En uso" para que el usuario vea el cambio
    const trainingTab = document.querySelector('[data-status="training"]');
    if (trainingTab) {
      document.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
      trainingTab.classList.add("active");
      currentStatus = "training";
      await loadGaps();
    }
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

document.querySelectorAll(".view-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status;
    await loadGaps();
  });
});

refresh().catch((err) => {
  emptyState.classList.remove("hidden");
  emptyState.innerHTML = `<strong>No se pudo cargar</strong>${escapeHtml(err.message)}`;
});
