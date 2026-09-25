/**
 * Smoke V10.21: nombre (Boutique/números) + dirección corta + colonia hint.
 */
import {
  sanitizeCrmNombre,
  sanitizeDisplayName,
  isOccasionOrStyleAsNombre,
  isNumberWordsAsNombre,
  isMeasurementOrDimensionAsNombre,
} from "../src/contact-name.ts";
import {
  isUsableDireccionEvento,
  isCompleteEventLocation,
  captureContextualAnswer,
  looksLikeNameAnswerMessage,
} from "../src/conversation-understanding.ts";
import { isInvalidCrmNombre } from "../src/lucyCrmInvariants.ts";
import { isFieldSatisfied } from "../src/lucy-flow-guards.ts";
import { LUCY_PROMPT_VERSION } from "../src/lib/lucyRelease.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

ok(LUCY_PROMPT_VERSION === "V10.21", `version ${LUCY_PROMPT_VERSION}`);

// 1) Estilo ≠ nombre
ok(isOccasionOrStyleAsNombre("Boutique"), "Boutique style");
ok(isOccasionOrStyleAsNombre("Fiesta Boutique"), "Fiesta Boutique");
ok(isOccasionOrStyleAsNombre("Evento Boutique"), "Evento Boutique");
ok(sanitizeCrmNombre("Boutique") === null, "sanitize Boutique");
ok(sanitizeCrmNombre("Evento Boutique") === null, "sanitize Evento Boutique");
ok(sanitizeDisplayName("Boutique") === null, "display Boutique");
ok(isInvalidCrmNombre("Boutique"), "invalid Boutique");
ok(!looksLikeNameAnswerMessage("Boutique"), "Boutique not name answer");

// 4) Números ≠ nombre
ok(isNumberWordsAsNombre("Uno Dos"), "Uno Dos");
ok(isNumberWordsAsNombre("123"), "123");
ok(sanitizeCrmNombre("Uno Dos") === null, "sanitize Uno Dos");
ok(sanitizeCrmNombre("cinco") === null, "sanitize cinco");

// Metros sigue bloqueado
ok(isMeasurementOrDimensionAsNombre("36 metros"), "36 metros");
ok(sanitizeCrmNombre("Metros") === null, "Metros");

// 2) Dirección corta sin ciudad
ok(!isUsableDireccionEvento("Boutique"), "Boutique not dir");
ok(!isUsableDireccionEvento("Fiesta"), "Fiesta not dir");
ok(isUsableDireccionEvento("Polanco CDMX"), "Polanco CDMX ok");
ok(isUsableDireccionEvento("Coyoacán") || isCompleteEventLocation("Coyoacán"), "Coyoacán city");

// 5) Colonia hint / ciudad completa
ok(isUsableDireccionEvento("colonia Roma"), "colonia Roma usable hint");
ok(!isCompleteEventLocation("colonia Roma"), "colonia Roma not complete");
ok(isCompleteEventLocation("Polanco, CDMX"), "Polanco CDMX complete");
ok(isCompleteEventLocation("colonia Roma, CDMX"), "colonia+CDMX complete");

const extractedColonia = {
  nombre: null,
  correo: null,
  tipo_evento: null,
  requerimientos_evento: null,
  num_invitados: null,
  direccion_evento: "colonia Roma",
  fecha_evento: null,
  horario_evento: null,
  fecha_horario: null,
  presupuesto: null,
};
ok(
  !isFieldSatisfied("zona", new Set(), extractedColonia),
  "zona not satisfied with colonia only"
);
ok(
  isFieldSatisfied(
    "zona",
    new Set(),
    { ...extractedColonia, direccion_evento: "Polanco CDMX" }
  ),
  "zona satisfied with Polanco CDMX"
);

// 3) asked nombre + basura
const histNombre = [
  { role: "assistant", content: "¿Me regalas tu nombre?" },
];
const capsBoutique = captureContextualAnswer(histNombre, "Boutique", new Set());
ok(
  !capsBoutique.some((c) => c.label === "Nombre del cliente"),
  "asked nombre + Boutique → no nombre"
);
const capsTipo = captureContextualAnswer(histNombre, "boda", new Set());
ok(
  !capsTipo.some((c) => c.label === "Nombre del cliente"),
  "asked nombre + boda → no nombre"
);
ok(
  capsTipo.some((c) => c.label === "Tipo de evento"),
  "asked nombre + boda → tipo"
);
const capsOk = captureContextualAnswer(histNombre, "María", new Set());
ok(
  capsOk.some((c) => c.label === "Nombre del cliente" && /mar/i.test(c.value)),
  "asked nombre + María → sí"
);

process.exit(fail ? 1 : 0);
