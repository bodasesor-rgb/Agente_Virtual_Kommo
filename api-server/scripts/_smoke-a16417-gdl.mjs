/**
 * A16417: en Humano Trabaja la clienta contestó "Gdl" y no se guardó la ubicación.
 */
import {
  parseZonaFromText,
  isUsableDireccionEvento,
  isCompleteEventLocation,
} from "../src/conversation-understanding.ts";
import { buildSilentWatchPatchPayload, SILENT_WATCH_FIELD } from "../src/silentWatchCrm.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

const cases = [
  ["Gdl", /guadalajara/i],
  ["gdl", /guadalajara/i],
  ["En GDL", /guadalajara/i],
  ["Mty", /monterrey/i],
  ["Qro", /quer[eé]taro/i],
  ["Zapopan, Jal.", /zapopan/i],
  ["Pue", /puebla/i],
];
for (const [t, re] of cases) {
  const z = parseZonaFromText(t);
  ok(!!z && re.test(z) && isUsableDireccionEvento(z) && isCompleteEventLocation(z), `${t} → ${z}`);
}

ok(parseZonaFromText("pue sí, gracias") === null || !/puebla/i.test(parseZonaFromText("pue sí, gracias") ?? ""), "'pue sí' no es Puebla");
ok(parseZonaFromText("Muchas gracias lo reviso") === null, "gracias lo reviso ≠ zona");
ok(isUsableDireccionEvento("Gdl"), "Gdl crudo en CRM también cuenta");

const emptyExtracted = {
  nombre: null, correo: null, tipo_evento: null, requerimientos_evento: null,
  num_invitados: null, direccion_evento: null, fecha_evento: null,
  horario_evento: null, fecha_horario: null, presupuesto: null,
};
const payload = buildSilentWatchPatchPayload("Gdl", emptyExtracted, "Rebeca", [
  "- Nombre del cliente: Rebeca",
  "- Número de invitados: 90",
]);
const dir = payload?.custom_fields_values?.find(
  (f) => f.field_id === SILENT_WATCH_FIELD.direccion_evento
);
ok(!!dir && /guadalajara/i.test(dir.values[0].value), `silent watch guarda dirección: ${dir?.values?.[0]?.value}`);

process.exit(fail ? 1 : 0);
