import { fetchMeetingContactInfo, buildMeetingDetails, isValidEmail } from "../src/services/meetingContactInfo.ts";
import { buildGoogleCalendarAddUrl } from "../src/services/meetingBooking.ts";

globalThis.fetch = async (url) => {
  const u = String(url);
  const body = u.includes("/leads/")
    ? {
        name: "Lead #27375926",
        custom_fields_values: [
          { field_id: 1048782, values: [{ value: "Boda" }] },
          { field_id: 1048778, values: [{ value: "sábado 15 de mayo de 2027" }] },
          { field_id: 1049358, values: [{ value: "5 pm" }] },
          { field_id: 1048780, values: [{ value: "100" }] },
          { field_id: 1048774, values: [{ value: "Jardín Las Palmas, Cuernavaca" }] },
          { field_id: 1048776, values: [{ value: "Iluminación, Colgantes Premium, Sillas Crossback" }] },
        ],
        _embedded: { contacts: [{ id: 99, is_main: true }] },
      }
    : {
        name: "Mariel Aranza",
        custom_fields_values: [
          { field_code: "PHONE", values: [{ value: "+52 1 55 1234 5678" }] },
          { field_code: "EMAIL", values: [{ value: "mariel@example.com" }] },
        ],
      };
  return new Response(JSON.stringify(body), { status: 200 });
};

const info = await fetchMeetingContactInfo("bodasesor", "x", 27375926);
const details = buildMeetingDetails(info, {
  kommoUrl: "https://bodasesor.kommo.com/leads/detail/27375926",
  footer: ["Confirmada por el equipo (nota del equipo).", 'Texto: "Videollamada mañana 10:30"'],
});
const url = buildGoogleCalendarAddUrl({
  title: `Videollamada Bodasesor — ${info.nombre}`,
  startMs: Date.UTC(2026, 9, 1, 16, 30),
  details,
  guests: isValidEmail(info.correo) ? [info.correo] : undefined,
});
console.log(details, "\n");
console.log(url, "\n");

const p = new URL(url).searchParams;
const checks = [
  ["nombre del contacto (no 'Lead #')", info.nombre === "Mariel Aranza"],
  ["whatsapp", /WhatsApp: \+52 1 55 1234 5678 \(https:\/\/wa\.me\/5215512345678\)/.test(details)],
  ["correo", details.includes("Correo: mariel@example.com")],
  ["evento", details.includes("Evento: Boda · sábado 15 de mayo de 2027, 5 pm · 100 invitados")],
  ["lugar", details.includes("Lugar: Jardín Las Palmas")],
  ["requerimientos", details.includes("Requerimientos: Iluminación")],
  ["invitado en el link", p.get("add") === "mariel@example.com"],
  ["hora 10:30 CDMX", p.get("dates")?.startsWith("20261001T103000")],
  ["correo inválido no se invita", !isValidEmail("no tengo")],
  ["sin datos no truena", buildMeetingDetails(null, { kommoUrl: "k", footer: [] }) === "Lead en Kommo: k"],
];
let bad = 0;
for (const [n, ok] of checks) {
  console.log(ok ? "OK  " : "FAIL", n);
  if (!ok) bad++;
}
if (bad) process.exit(1);
console.log("OK smoke meeting-contact");
