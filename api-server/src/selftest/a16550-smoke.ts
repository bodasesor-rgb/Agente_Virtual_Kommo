/**
 * Smoke A16550 Alejandro (WhatsApp "Romeo") — corporativo, barra de sushi, Santa Fe:
 * "el 25 de noviembre en la mañana" llena fecha Y horario (no re-preguntar hora);
 * "No soy Romeo, soy Alejandro" corrige el nombre; "sí, adelante" tras ofrecer niveles los manda.
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  parseHorarioFromText,
  captureContextualAnswer,
  CRM_FECHA_LABEL,
  CRM_HORARIO_LABEL,
} from "../conversation-understanding.js";
import { parseNombreCorrection } from "../contact-name.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { setCatalogSnapshotForTests } from "../services/catalogService.js";
import { parseSheetCatalogCsv } from "../services/googleSheetsCatalog.js";
import type { ExtractedData } from "../types.js";

const u = (c: string) => ({ role: "user", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const a = (c: string) => ({ role: "assistant", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;

// Horario por franja dentro de frases largas.
assert.equal(parseHorarioFromText("el 25 de noviembre en la mañana"), "en la mañana");
assert.equal(parseHorarioFromText("no se bien ahora, te confirmo despues pero seria en la mañana"), "en la mañana");
assert.equal(parseHorarioFromText("mañana te confirmo"), null);
assert.equal(parseHorarioFromText("a las 3 de la tarde"), "3 de la tarde");
{
  const caps = captureContextualAnswer(
    [u("100 personas en santa fe"), a("¿Para qué fecha y en qué horario lo tienen pensado?")],
    "el 25 de noviembre en la mañana",
    new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios", "Número de invitados"])
  );
  assert.ok(caps.some((c) => c.label === CRM_FECHA_LABEL && /25 de noviembre/.test(c.value)), JSON.stringify(caps));
  assert.ok(caps.some((c) => c.label === CRM_HORARIO_LABEL && /ma[nñ]ana/.test(c.value)), JSON.stringify(caps));
}

// Corrección de nombre.
assert.equal(parseNombreCorrection("No soy romeo, soy alejandro\nes para un evento corporativo"), "Alejandro");
assert.equal(parseNombreCorrection("no me llamo Romeo, me llamo Alejandro Pérez"), "Alejandro Pérez");
assert.equal(parseNombreCorrection("mi nombre es Alejandro, no Romeo"), "Alejandro");
assert.equal(parseNombreCorrection("soy cliente, no proveedor"), null);
assert.equal(parseNombreCorrection("no soy proveedor, soy cliente"), null);
assert.equal(parseNombreCorrection("no es para mí, es para mi hija"), null);
assert.equal(parseNombreCorrection("soy Alejandro"), null);

const guard = (o: { ai: string; cur: string; hist: OpenAI.Chat.ChatCompletionMessageParam[]; extracted: Partial<ExtractedData>; filled: string[] }) =>
  applyLucyMessageGuards({
    aiResponse: o.ai,
    extracted: { tipo_contacto: "cliente", ...o.extracted } as ExtractedData,
    filledSet: new Set(o.filled),
    history: o.hist,
    currentMessage: o.cur,
    entityId: "A16550",
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    forceFirstPresentation: false,
    buildClosing: () => "CIERRE",
    whatsappDisplayName: "Romeo",
  });

{
  const out = guard({
    ai: "Gracias por la aclaración. Para tu evento corporativo podemos armar algo muy profesional. ¿Qué servicios te gustaría revisar primero?",
    cur: "No soy romeo, soy alejandro\nes para un evento corporativo",
    hist: [u("hola lucy, me gustaria cotizar un evento para ciudad de mexico"), a("¡Mucho gusto, Romeo! ¿Qué tipo de evento tienes en mente celebrar?")],
    extracted: { nombre: "Alejandro", tipo_evento: "evento corporativo", direccion_evento: "Ciudad de México" },
    filled: ["Nombre del cliente", "Tipo de evento", "Lugar/dirección del evento"],
  });
  assert.ok(/Alejandro/.test(out) && !/Romeo/i.test(out), out);
}

// "sí, adelante" tras ofrecer niveles → los manda (Sheet de prueba).
setCatalogSnapshotForTests(
  parseSheetCatalogCsv(
    [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye","Sinonimos"',
      '"Barra de sushi","Básico","$280.00","$14,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","Rollos clásicos"',
      '"Barra de sushi","Premium","$420.00","$21,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","Rollos especiales y nigiri"',
    ].join("\n")
  )
);
{
  const full = {
    nombre: "Alejandro",
    tipo_evento: "evento corporativo",
    requerimientos_evento: "Barra de sushi, Mobiliario",
    num_invitados: 100,
    fecha_evento: "25 de noviembre",
    horario_evento: "en la mañana",
    direccion_evento: "Santa Fe, Ciudad de México",
  } as Partial<ExtractedData>;
  const out = guard({
    ai: "Excelente. Las inclusiones exactas de cada uno te las confirmo con nuestro equipo al detalle, pero ¿tienes preferencia por alguno para empezar a armar tu propuesta?",
    cur: "si, adelante",
    hist: [
      u("no se bien ahora, te confirmo despues pero seria en la mañana"),
      a(
        "Perfecto, lo sumo para el 25 de noviembre por la mañana en Santa Fe. Sobre la barra de sushi, tenemos varias opciones. ¿Te gustaría que te comparta el detalle de los niveles disponibles para que veas cuál se adapta mejor a tu evento?"
      ),
    ],
    extracted: full,
    filled: [
      "Nombre del cliente", "Tipo de evento", "Requerimientos o servicios", "Número de invitados",
      CRM_FECHA_LABEL, CRM_HORARIO_LABEL, "Lugar/dirección del evento",
    ],
  });
  assert.ok(/sushi/i.test(out) && /\$\s*\d/.test(out), out);
  assert.ok(!/horario|a\s+qu[eé]\s+hora/i.test(out), out);
}

console.log("a16550-smoke OK");
