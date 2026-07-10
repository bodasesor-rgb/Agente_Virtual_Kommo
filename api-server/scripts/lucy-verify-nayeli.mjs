/**
 * Verificación post-deploy del fix A14766 (Nayeli — presupuesto sin bucle).
 * Uso: node scripts/lucy-verify-nayeli.mjs [baseUrl]
 */
const BASE =
  process.argv[2]?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

const leadId = 93066;

async function reset() {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(text) {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      lead_id: leadId,
      lead: {
        id: leadId,
        name: "Nayeli",
        pipeline_id: "pipeline_bodasesor",
        stage_id: "stage_datos_intereses",
        contact_phone: "+5215544949974",
        contact_email: "",
        custom_fields: {},
      },
    }),
  });
  return res.json();
}

function countPresupuestoAsks(replies) {
  return replies.filter((r) =>
    /presupuesto|rango\s+de\s+inversi|idea\s+del\s+presupuesto/i.test(r) && r.includes("?")
  ).length;
}

const FLOW = [
  { user: "¡Hola, me gustaría cotizar un evento con ustedes!", label: "apertura" },
  { user: "Nayeli granados", label: "nombre" },
  { user: "Puede ser vía Watsapp\nPor favor", label: "correo waiver" },
  { user: "naygt_13@hotmail.com", label: "correo" },
  { user: "Una primera comunión", label: "tipo evento" },
  { user: "Video y fotografía\nPara el día del evento", label: "servicios" },
  { user: "Y un libro de fotos", label: "servicio extra" },
  { user: "Es familiar de 40 personas", label: "invitados" },
  { user: "En la parroquia de Santo Domingo de Guzmán\nEn insurgentes mixcoac", label: "ubicación" },
  { user: "Mi tope es de 5,000", label: "presupuesto — tope" },
  { user: "Que me propongan opciones", label: "presupuesto — propongan" },
  { user: "No", label: "presupuesto — no" },
  { user: "No gracias", label: "cierre gracias" },
];

async function main() {
  console.log(`Verificación A14766 — ${BASE}\n`);
  await reset();

  const transcript = [];
  const lucyReplies = [];
  let presupuestoAsks = 0;
  let closed = false;
  let error = null;

  for (const step of FLOW) {
    const data = await send(step.user);
    const reply = data.reply || `[ERROR: ${data.error}]`;
    transcript.push({ ...step, reply, status: data.status });
    if (data.status === "error" || data.error) {
      error = reply;
      break;
    }
    lucyReplies.push(reply);
    presupuestoAsks = countPresupuestoAsks(lucyReplies);
    if (/Perfecto, ya tengo todo|ya tengo todo/i.test(reply)) closed = true;
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("TRANSCRIPT:\n");
  for (const t of transcript) {
    console.log(`👤 Cliente (${t.label}): ${t.user.replace(/\n/g, " / ")}`);
    console.log(`🤖 Lucy: ${t.reply.replace(/\n/g, " | ")}\n`);
  }

  const checks = {
    sinError: !error,
    presupuestoMax2: presupuestoAsks <= 2,
    cerro: closed,
    topeNoRepite:
      transcript.find((t) => t.label === "presupuesto — tope") &&
      !/presupuesto|rango/i.test(
        transcript
          .slice(transcript.findIndex((t) => t.label === "presupuesto — tope") + 1)
          .map((t) => t.reply)
          .join(" ")
      ),
    waiverWhatsapp: transcript.some(
      (t) => t.label === "correo waiver" && /seguimos por aquí|sin problema/i.test(t.reply)
    ),
    vendeVideo: transcript.some((t) =>
      /video|fotograf|nuestro equipo|cotizaci/i.test(t.reply)
    ),
  };

  console.log("CHECKS:");
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? "✓" : "✗"} ${k}`);
  }
  console.log(`\nPreguntas de presupuesto: ${presupuestoAsks} (máx permitido: 2)`);

  const allOk = Object.values(checks).every(Boolean);
  console.log(allOk ? "\n✅ VERIFICACIÓN OK" : "\n❌ VERIFICACIÓN FALLÓ");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
