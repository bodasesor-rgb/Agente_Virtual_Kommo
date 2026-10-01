/**
 * Smoke A16567 Alejandro — bautizo, banquete formal servicio completo, CDMX:
 * - "Entendido, Alejandro." no se vuelve "Entendido, nuestro equipo." (el asesor también es Alejandro).
 * - El texto del PDF sale con encabezados y viñetas, no "amontonado"; la queja reenvía ordenado.
 * - "de moda" / "esa moda" activan la búsqueda de ideas; "¿Tienes ideas de decoración?" no es
 *   "Decoración no lo tengo listado".
 * - "Aún no sabemos la ubicación" no es presupuesto; "Tienes ideas de decoración?" no es dirección.
 * - Lo investigado se recuerda por tema.
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { normalizeAdvisorReferences } from "../lib/bodasesorAdvisor.js";
import { mergeZonaDetail, parsePresupuestoFromText } from "../conversation-understanding.js";
import { clientWantsIdeasOrTrends } from "../services/trendKnowledge.js";
import {
  clientComplainsAboutFormat,
  formatCatalogTextForChat,
} from "../services/lucyInfoPriceCache.js";
import {
  findTrendResearch,
  setTrendResearchStoreForTests,
  trendTopicWords,
  rememberTrendResearch,
  type TrendResearchEntry,
} from "../services/googleGrounding.js";
import { finalizeLucyOutboundMessage } from "../lucyOutboundPipeline.js";

const u = (c: string) => ({ role: "user", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const a = (c: string) => ({ role: "assistant", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;

// Nombre del cliente = nombre del asesor.
assert.equal(
  normalizeAdvisorReferences("Entendido, Alejandro. Lo anotamos en CDMX.", "Alejandro"),
  "Entendido, Alejandro. Lo anotamos en CDMX."
);
assert.match(
  normalizeAdvisorReferences("Gracias por tu correo, Alejandro. Para un bautizo de niño…", "Alejandro"),
  /correo, Alejandro\./
);
assert.match(
  normalizeAdvisorReferences("Con esto Alejandro te arma la cotización.", "Karla"),
  /nuestro equipo te arma/
);

// Búsqueda de ideas.
assert.ok(clientWantsIdeasOrTrends("Vi unos como de osos o de abejas que está de moda"));
assert.ok(clientWantsIdeasOrTrends("Si ubicas sobre esa moda? De abejas para bautizo?"));
assert.ok(clientWantsIdeasOrTrends("Tienes ideas de decoración?"));
assert.ok(!clientWantsIdeasOrTrends("Quiero con servicio completo"));

// Capturas.
assert.equal(parsePresupuestoFromText("Aún no sabemos la ubicación pero será en la cdm", { askedField: "presupuesto" }), null);
assert.equal(parsePresupuestoFromText("Aún no sabemos la ubicación pero será en la cdm"), null);
assert.match(String(parsePresupuestoFromText("aún no tenemos presupuesto", { askedField: "presupuesto" })), /Sin definir/);
assert.equal(mergeZonaDetail("CDMX", "Tienes ideas de decoración?"), "CDMX");
assert.match(String(mergeZonaDetail("CDMX", "Salón Los Arcos")), /CDMX.*Los Arcos|Los Arcos.*CDMX/);

// Formato del PDF.
const RAW =
  "entre dos menús diferentes. Menú 4 tiempos Tradicional Una entrada Una sopa o pasta Un plato fuerte (lomo o pollo) Dos guarniciones Un postre En eventos que superen las 100 personas, ofrecemos la opción de elegir entre dos menús distintos. Menú 4 tiempos Premium Una entrada Una sopa o pasta Un plato fuerte (proteína libre) Dos guarniciones Un postre Para eventos con más de 100 personas, ofrecemos la opción de seleccionar entre dos menús distintos. 🍽 Opción Solo Alimentos con vajilla blanca: Menú 3 tiempos desde $450 por persona | Menú 4 tiempos desde $500 por persona";
{
  const f = formatCatalogTextForChat(RAW);
  assert.ok(f.startsWith("*Menú 4 tiempos Tradicional*\n• Una entrada\n• Una sopa o pasta"), f);
  assert.match(f, /\*Menú 4 tiempos Premium\*\n• Una entrada/, f);
  assert.equal((f.match(/m[aá]s de 100 personas|superen las 100 personas/gi) ?? []).length, 1, f);
  assert.match(f, /🍽 Opción Solo Alimentos con vajilla blanca:\n• Menú 3 tiempos desde \$450 por persona\n• Menú 4 tiempos desde \$500/, f);
  assert.equal(formatCatalogTextForChat(f), f, "idempotente");
}
assert.ok(clientComplainsAboutFormat("Por qué escribes así de amontonado?"));
assert.ok(!clientComplainsAboutFormat("Quiero banquete formal"));

// Memoria de lo investigado.
{
  setTrendResearchStoreForTests([], "");
  const w1 = trendTopicWords("Vi unos como de osos o de abejas que está de moda");
  assert.ok(w1.includes("abeja") && w1.includes("osos"), JSON.stringify(w1));
  rememberTrendResearch("bautizo", w1, "- Abejitas en amarillo pastel\n- Ositos en azul cielo");
  const w2 = trendTopicWords("tienes ideas de osos y abejas?");
  const hit = findTrendResearch([{ tipo: "bautizo", words: w1, snippet: "S", savedAt: new Date().toISOString(), uses: 0 }], "Bautizo", w2);
  assert.ok(hit, `mismo tema → recordado ${JSON.stringify(w2)}`);
  assert.equal(findTrendResearch([{ tipo: "bautizo", words: w1, snippet: "S", savedAt: new Date().toISOString(), uses: 0 }], "boda", w2), null);
  const old: TrendResearchEntry = { tipo: "bautizo", words: w1, snippet: "S", savedAt: "2020-01-01T00:00:00Z", uses: 0 };
  assert.equal(findTrendResearch([old], "bautizo", w2), null, "vencido (30 días)");
  setTrendResearchStoreForTests(null, null);
}

// Pipeline: ideas sin aviso de "no lo tengo listado"; queja de formato reenvía ordenado.
(async () => {
  const extracted: any = {
    tipo_contacto: "cliente", nombre: "Alejandro", tipo_evento: "bautizo",
    requerimientos_evento: "Banquete Formal, Pantallas, DJ", num_invitados: 100,
    fecha_evento: "20 de octubre", horario_evento: "en la noche", direccion_evento: "CDMX",
    correo: "a.sanchez@gmail.com",
  };
  const filledSet = new Set([
    "Nombre del cliente", "Tipo de evento", "Requerimientos o servicios", "Número de invitados",
    "Fecha del evento", "Horario del evento", "Lugar/dirección del evento", "Correo electrónico",
  ]);
  const history = [u("Banquete formal"), a("Para *Banquete Formal* tenemos dos caminos"), u("Quiero con servicio completo"), a("¿Cuántos invitados?")];
  const ideas = await finalizeLucyOutboundMessage({
    mensaje:
      "Perfecto — *Decoración* no lo tengo listado en el catálogo. Lo anoto y nuestro equipo confirma si lo podemos armar (descripción, precio e inclusiones).\n\nTe dejo el catálogo general por si quieres ver otras opciones:\nhttps://bodasesor.com/catalogos\n\n¿Lo dejamos anotado o prefieres revisar otra opción del catálogo?",
    extracted, readyForClosing: false, cierreYaEnviado: false, currentMessage: "Tienes ideas de decoración?",
    history, filledSet, openai: null,
    trendGroundingSnippet: "- Temática de ositos en azul cielo y beige con globos orgánicos.\n- Abejitas en amarillo pastel con panales de papel y mesa de dulces.",
  });
  assert.doesNotMatch(ideas, /no lo tengo listado|Lo dejamos anotado/i, ideas);
  assert.match(ideas, /ositos/i, ideas);
  assert.match(ideas, /decoraci[oó]n\*? va incluida en el \*servicio completo/i, ideas);

  const dump = `Según el catálogo que ya tenemos de *Banquete Formal Bodasesor*:\n\n${RAW}\n\n¿Te late este nivel o quieres que te detalle otro?`;
  const again = await finalizeLucyOutboundMessage({
    mensaje: dump,
    extracted, readyForClosing: false, cierreYaEnviado: false, currentMessage: "Por qué escribes así de amontonado?",
    history: [...history, u("[foto]"), a(dump)], filledSet, openai: null,
  });
  assert.match(again, /^Tienes razón, Alejandro, perdón\. Te lo paso más ordenado:/, again);
  assert.match(again, /\*Menú 4 tiempos Tradicional\*\n• Una entrada/, again);
  console.log("a16567-smoke OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
