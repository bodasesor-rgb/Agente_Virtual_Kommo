#!/usr/bin/env node
/** Prueba rápida: Lucy cita precio del Sheet cuando preguntan por taquiza. */
const BASE =
  process.env.LUCY_URL?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

const leadId = `test-catalog-price-${Date.now()}`;
const snapshot = `- Nombre del cliente: Carlos
- Correo electrónico: carlos@test.com
- Requerimientos del evento: taquiza
- Número de invitados: 100
- Tipo de evento: bautizo
- Dirección del evento: CDMX
- Fecha y horario: 20 de septiembre de 2026`;

async function send(text, extra = {}) {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      lead_id: leadId,
      lead: {
        id: leadId,
        name: "Carlos",
        contact_email: "carlos@test.com",
        custom_fields: {
          cf_crm_snapshot: snapshot,
          cf_requerimiento: "taquiza",
          cf_num_invitados: 100,
          cf_tipo_evento: "bautizo",
          cf_direccion: "CDMX",
          cf_fecha_horario: "20 sep 2026",
          ...extra,
        },
      },
    }),
  });
  return res.json();
}

async function main() {
  const catalog = await fetch(`${BASE}/api/catalog/status`).then((r) => r.json());
  console.log("Catalog:", catalog.catalog?.sources);

  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });

  await send("Hola");
  await new Promise((r) => setTimeout(r, 1500));

  const data = await send("¿cuánto cuesta la taquiza por persona?");
  const reply = data.reply || data.error;
  console.log("\nLucy:", reply);

  const ok =
    /\$300|\$750|\$800|\$850|300\.00|750\.00/i.test(reply) ||
    /taquiza.*\$/i.test(reply);
  console.log(ok ? "\n✅ Precio del Sheet citado" : "\n❌ No se detectó precio del Sheet");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
