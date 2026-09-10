/**
 * Smoke V9.79 — A15897 Lizbeth (tono robótico):
 * - "Perfecto, mesa y sillas anotadas" no se convierte en "Perfecto, Lizbeth y sillas"
 * - "Sí me interesa. 60 invitados" no es una despedida
 * - una despedida no lleva la pregunta del embudo pegada
 * - "Gracias por tu correo, X. Gracias por el dato, X." → un solo agradecimiento
 * - el nombre del cliente no se repite en mensajes seguidos
 * - muletilla suelta antes de la pregunta ("Claro que sí.") se cae
 * node ./scripts/run-v979-class-smoke.mjs
 */
import assert from "node:assert/strict";
import type { OpenAI } from "openai";
import { rewriteJunkClientVocative } from "../contact-name.js";
import { clientSoftDeclinesLead } from "../conversation-understanding.js";
import { isFarewellReply, buildSoftLeadDeclineReply } from "../lucy-flow-guards.js";
import {
  applyClientNameCadence,
  stripClientNameVocative,
  stripMidMessageFiller,
} from "../lucyNaturalTone.js";
import { buildStaticSystemPrompt } from "../services/promptBuilder.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.90");

const asst = (content: string) => ({ role: "assistant" as const, content });
const user = (content: string) => ({ role: "user" as const, content });

// 1) "mesa" en medio de una frase no es un vocativo que haya que corregir.
{
  const frase =
    "Perfecto, mesa y sillas anotadas. Como complemento suele ir mantelería y, si quieres, barra de bebidas.";
  assert.equal(rewriteJunkClientVocative(frase, "Lizbeth"), frase);
  // El caso real de A15705 sigue funcionando: vocativo suelto → nombre bueno.
  assert.match(
    rewriteJunkClientVocative("¡Con gusto, Sería! Aquí seguimos cuando lo necesites.", "Karla Rodríguez"),
    /Con gusto,\s*Karla/i
  );
}

// 2) "Sí me interesa" es un sí; la despedida necesita el "les aviso".
{
  assert.equal(clientSoftDeclinesLead("Si me interesa. 60 invitados"), false);
  assert.equal(clientSoftDeclinesLead("Sí me interesa"), false);
  assert.ok(clientSoftDeclinesLead("Gracias, me pongo en contacto si nos interesa"));
  assert.ok(clientSoftDeclinesLead("Les aviso si nos interesa"));
  assert.ok(clientSoftDeclinesLead("Lo evaluamos y te digo"));
}

// 3) La despedida se reconoce para que ninguna capa le cuelgue una pregunta.
{
  const despedida = buildSoftLeadDeclineReply("Lizbeth");
  assert.ok(isFarewellReply(despedida), despedida);
  assert.equal(isFarewellReply("Anotado. ¿Qué día tienen en mente?"), false);
}

// 4) Cadencia del nombre: se queda la primera vez, se cae si Lucy acaba de usarlo.
{
  const historyConNombre: OpenAI.Chat.ChatCompletionMessageParam[] = [
    asst("Perfecto, Lizbeth. Anoto la ubicación en *Valle de Bravo*."),
    user("17 de abril 2027"),
  ];
  const repetido = applyClientNameCadence({
    mensaje: "Anotado, Lizbeth. ¿En qué horario tienen planeado realizar el evento?",
    clientName: "Lizbeth",
    history: historyConNombre,
  });
  assert.equal(repetido, "Anotado. ¿En qué horario tienen planeado realizar el evento?");

  // Si no lo dijo hace poco, el nombre se respeta.
  const historySinNombre: OpenAI.Chat.ChatCompletionMessageParam[] = [
    asst("Anoto la ubicación en *Valle de Bravo*."),
    user("17 de abril 2027"),
  ];
  const conservado = applyClientNameCadence({
    mensaje: "Anotado, Lizbeth. ¿En qué horario tienen planeado realizar el evento?",
    clientName: "Lizbeth",
    history: historySinNombre,
  });
  assert.match(conservado, /Lizbeth/);

  // El turno que confirma el nombre nunca se toca.
  const confirmacion = "¿Me confirmas si tu nombre es Lizbeth o prefieres otro?";
  assert.equal(
    applyClientNameCadence({
      mensaje: confirmacion,
      clientName: "Lizbeth",
      history: historyConNombre,
    }),
    confirmacion
  );

  // Vocativo al inicio de línea también se limpia.
  assert.equal(
    stripClientNameVocative("Lizbeth, ¿qué día tienen en mente?", "Lizbeth"),
    "¿qué día tienen en mente?"
  );
}

// 5) Muletilla suelta a media respuesta.
{
  const pegado =
    "Perfecto, mesa y sillas anotadas. Dime si te interesa alguno. Claro que sí. ¿Cuántos invitados tienen contemplados?";
  assert.equal(
    stripMidMessageFiller(pegado),
    "Perfecto, mesa y sillas anotadas. Dime si te interesa alguno. ¿Cuántos invitados tienen contemplados?"
  );
  // La apertura del mensaje sí se respeta.
  const apertura = "Claro que sí. ¿Cuántos invitados tienen contemplados?";
  assert.equal(stripMidMessageFiller(apertura), apertura);
}

// 6) El prompt pide el nombre con cadencia y una sola idea hilada.
{
  const sys = buildStaticSystemPrompt();
  assert.match(sys, /no en cada mensaje/i);
  assert.match(sys, /una idea hilada/i);
}

console.log("V9.79 class smoke OK");
