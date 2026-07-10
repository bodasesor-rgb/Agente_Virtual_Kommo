const API = "/api";

const sectionIntro = document.getElementById("section-intro");
const manualTeach = document.getElementById("manual-teach");
const statsRow = document.getElementById("stats-row");
const gapsList = document.getElementById("gaps-list");
const emptyState = document.getElementById("empty-state");

let currentStatus = "pending";
let refreshTimer = null;

const INTRO = {
  pending:
    "Preguntas detectadas en <strong>chats reales o en el simulador</strong> donde Lucy no tuvo la respuesta en catálogo. Escríbele la respuesta correcta y quedará activa en WhatsApp.",
  answered:
    "Historial de lo que <strong>ya enseñaste</strong> desde este panel: pregunta del cliente, lo que Lucy dijo, y la respuesta que quedó guardada.",
  training:
    "Estos ejemplos son los que <strong>Lucy usa ahora mismo</strong> en conversaciones (few-shot). Cada enseñanza nueva aparece aquí en segundos.",
};

const WORKFLOW = `
  <ol class="workflow-steps">
    <li><strong>1.</strong> Prueba en el <a href="/panel#simulador">Simulador</a> una pregunta que Lucy no sepa (precio, servicio, inclusión).</li>
    <li><strong>2.</strong> Si no aparece sola abajo, usa <strong>Enseñar algo nuevo</strong> y escribe pregunta + respuesta.</li>
    <li><strong>3.</strong> Revisa <strong>En uso por Lucy</strong> para confirmar que el aprendizaje quedó activo.</li>
  </ol>
`;

function notifyParent() {
  try {
    window.parent?.postMessage({ type: "lucy-learning-updated" }, window.location.origin);
  } catch {
    /* iframe cross-origin */
  }
}

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
    manual: "Manual",
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

function renderManualTeachForm() {
  manualTeach.classList.remove("hidden");
  manualTeach.innerHTML = `
    <h2>Enseñar algo nuevo</h2>
    <p class="hint">Si Lucy no supo algo y no apareció en la lista, créalo aquí. Se guarda al instante y Lucy lo usa en el siguiente chat.</p>
    ${WORKFLOW}
    <form id="teach-form">
      <label>Tema (opcional)
        <input type="text" id="teach-topic" placeholder="Ej: Precio DJ, Barra de mariscos en Cuernavaca" />
      </label>
      <label>Si el cliente dice…
        <textarea id="teach-question" required placeholder="Ej: ¿Cuánto cuesta el DJ para 150 personas?"></textarea>
      </label>
      <label>Lucy debe responder así
        <textarea id="teach-answer" required placeholder="Ej: El DJ desde $8,500 por 4 horas incluye equipo básico. Nuestro equipo confirma según el evento."></textarea>
      </label>
      <button type="submit" class="btn-save" id="teach-submit">Guardar y activar en Lucy</button>
    </form>
  `;

  document.getElementById("teach-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("teach-submit");
    const question = document.getElementById("teach-question")?.value?.trim();
    const answer = document.getElementById("teach-answer")?.value?.trim();
    const topic = document.getElementById("teach-topic")?.value?.trim();
    if (!question || !answer) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Guardando…";
    }
    try {
      await api("/knowledge-gaps/teach", {
        method: "POST",
        body: JSON.stringify({ question, answer, topic: topic || undefined }),
      });
      document.getElementById("teach-form")?.reset();
      notifyParent();
      currentStatus = "training";
      document.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
      document.querySelector('[data-status="training"]')?.classList.add("active");
      await refresh();
    } catch (err) {
      alert(err.message || "Error al guardar");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Guardar y activar en Lucy";
      }
    }
  });
}

async function loadStats() {
  const overview = await api("/knowledge-gaps/overview");
  const gaps = overview.gaps ?? {};
  const training = overview.training ?? {};
  const total = (gaps.pending ?? 0) + (gaps.answered ?? 0) + (gaps.dismissed ?? 0);
  const panelTaught = training.panelTaught ?? 0;

  statsRow.innerHTML = `
    <div class="stat-card pending">
      <strong>${gaps.pending ?? 0}</strong>
      <span>No sabe — pendientes</span>
    </div>
    <div class="stat-card learned">
      <strong>${gaps.answered ?? 0}</strong>
      <span>Ya enseñaste</span>
    </div>
    <div class="stat-card total">
      <strong>${panelTaught}</strong>
      <span>En uso por Lucy</span>
    </div>
    <div class="stat-card dismissed">
      <strong>${total}</strong>
      <span>Total en panel</span>
    </div>
  `;

  updateTabCounts(gaps, panelTaught);
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
        <textarea class="answer-box" data-answer placeholder="Ej: El DJ desde $8,500 por 4 horas, incluye equipo básico. Nuestro equipo confirma según el evento."></textarea>
      </label>
      <div class="gap-actions">
        <button type="button" class="btn-save save-btn">Guardar y enseñar a Lucy</button>
        <button type="button" class="btn-ghost dismiss-btn">Descartar</button>
      </div>
    </div>
    <div class="gap-footer">
      <span>${gap.kommoLeadId ? `Lead Kommo #${escapeHtml(gap.kommoLeadId)}` : "Desde simulador o chat"}</span>
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
      <span>En uso en conversaciones de WhatsApp</span>
      <span>${formatDate(example.createdAt)}</span>
    </div>
  `;

  return card;
}

async function loadGaps() {
  sectionIntro.innerHTML = INTRO[currentStatus] ?? "";
  gapsList.innerHTML = "";
  manualTeach.classList.add("hidden");

  if (currentStatus === "pending") {
    renderManualTeachForm();
  }

  if (currentStatus === "training") {
    const data = await api("/knowledge-gaps/training-recent?limit=50");
    if (!data.examples?.length) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `<strong>Aún no hay ejemplos activos</strong>Enseña una respuesta en «No sabe» o con el formulario «Enseñar algo nuevo». Aparecerá aquí al guardar.`;
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
        ? `<strong>No hay preguntas pendientes ahora</strong>Prueba en el simulador una pregunta sin precio (ej. «¿cuánto cuesta el DJ?») o usa el formulario de arriba para enseñar algo manualmente.`
        : `<strong>Aún no hay historial</strong>Cuando enseñes una respuesta, aparecerá aquí con la pregunta y la respuesta correcta.`;
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
    notifyParent();
    currentStatus = "training";
    document.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-status="training"]')?.classList.add("active");
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
  notifyParent();
  await refresh();
}

async function refresh() {
  await loadStats();
  await loadGaps();
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      loadStats().catch(() => {});
      if (currentStatus === "pending") {
        loadGaps().catch(() => {});
      }
    }
  }, 20000);
}

document.querySelectorAll(".view-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status;
    await loadGaps();
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh().catch(() => {});
});

refresh()
  .then(() => startAutoRefresh())
  .catch((err) => {
    emptyState.classList.remove("hidden");
    emptyState.innerHTML = `<strong>No se pudo cargar</strong>${escapeHtml(err.message)}`;
  });
