/**
 * 10 ramas de flujo — verificación detallada multi-turno.
 */
import type { OpenAI } from "openai";
import type { ExtractedData } from "../src/types.js";
import {
  applyLucyMessageGuards,
  CLOSING_SIGNATURE,
  getNextPendingField,
  isReadyForClosing,
  mensajeAsksForField,
  buildPhoneAnswer,
  isValidRequerimientosValue,
} from "../src/lucy-flow-guards.js";
import {
  parseInvitadosFromText,
  parseZonaFromText,
  parseSalaProductFromText,
  isLikelyProductNameNotLocation,
  isUsableDireccionEvento,
  parseServicesFromText,
  clientMentionsItalianTheme,
  parseTipoEventoFromText,
  clientDeclinesMoreServices,
  isGenericQuoteIntentRequerimiento,
} from "../src/conversation-understanding.js";
import { applyLucyGlobalAntiRepetition } from "../src/lucyOutboundAntiRepeat.js";
import { sanitizeExtractedFromExternal } from "../src/lib/external-ingest-sanitize.js";
import { readFileSync } from "node:fs";

type Msg = OpenAI.Chat.ChatCompletionMessageParam;

function emptyExtracted(partial: Partial<ExtractedData> = {}): ExtractedData {
  return {
    tipo_contacto: "cliente",
    nombre: null,
    empresa: null,
    telefono: null,
    correo: null,
    presupuesto: null,
    direccion_evento: null,
    requerimientos_evento: null,
    fecha_horario: null,
    num_invitados: null,
    tipo_evento: null,
    modo_servicio: null,
    ...partial,
  };
}

function mockClosing(req: string | null, nombre: string | null): string {
  return `Perfecto, ya tengo todo.${nombre ? ` ${nombre}.` : ""} ${req ?? ""} Paso a nuestro equipo.`;
}

function turn(opts: {
  ai: string;
  extracted: ExtractedData;
  filled: Set<string>;
  msg: string;
  history: Msg[];
  cierre?: boolean;
  ready?: boolean;
  wa?: string | null;
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.ai,
    extracted: opts.extracted,
    filledSet: opts.filled,
    readyForClosing: opts.ready ?? false,
    cierreYaEnviado: opts.cierre ?? false,
    emailRefusedThisTurn: false,
    history: opts.history,
    currentMessage: opts.msg,
    whatsappDisplayName: opts.wa,
    buildClosing: mockClosing,
  });
}

type Result = {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
  notes: string[];
  replies?: string[];
};

function check(name: string, fn: () => void | string[]): Result {
  const notes: string[] = [];
  try {
    const extra = fn();
    if (Array.isArray(extra)) notes.push(...extra);
    return { id: name.split(":")[0]!, name, ok: true, notes };
  } catch (e) {
    return {
      id: name.split(":")[0]!,
      name,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      notes,
    };
  }
}

export async function runTenBranchProbes() {
  const results: Result[] = [];

  // ── 1. María: salas lounge + correo + carpas ─────────────────────────────
  results.push(
    check("R1: María A14906 — salas lounge → carpas transparentes", () => {
      const notes: string[] = [];
      if (parseInvitadosFromText("Serían 4 salas") !== null) {
        throw new Error("4 salas se parseó como invitados");
      }
      notes.push('parseInvitados("Serían 4 salas") = null ✓');

      const sala = parseSalaProductFromText("cotizar la sala: Luxor Rosa. Serían 4 salas");
      if (!sala || !/luxor|4/i.test(sala)) throw new Error(`sala product: ${sala}`);
      notes.push(`producto: ${sala}`);

      if (isUsableDireccionEvento("Luxor Rosa")) throw new Error("Luxor Rosa aceptado como zona");
      if (parseZonaFromText("sala: Luxor Rosa")) throw new Error("zona capturó sala product");
      notes.push("Luxor Rosa ≠ ubicación ✓");

      const filled = new Set(["Nombre del cliente"]);
      const ex = emptyExtracted({ nombre: "Maria" });
      const h: Msg[] = [
        {
          role: "assistant",
          content:
            "Con gusto te apoyo. ¿Me podrías proporcionar tu correo electrónico para enviarte la información?",
        },
      ];
      const r1 = turn({
        ai: "Mucho gusto, Maria. ¿A qué correo te lo envío?",
        extracted: ex,
        filled,
        msg: "Serían 4 salas",
        history: h,
        wa: "Maria",
      });
      if (!/sala|anoto/i.test(r1)) throw new Error(`no acusó salas: ${r1.slice(0, 200)}`);
      if (/proporcionar tu correo electr[oó]nico/i.test(r1)) {
        throw new Error(`clonó el mismo ask de correo: ${r1.slice(0, 200)}`);
      }
      notes.push(`tras 4 salas: ${r1.slice(0, 120)}…`);

      ex.correo = "maria.gomez@gopop.mx";
      filled.add("Correo electrónico");
      filled.add("Tipo de evento");
      ex.tipo_evento = "cumpleaños";
      ex.requerimientos_evento = sala;
      filled.add("Requerimientos o servicios");

      const r2 = turn({
        ai: "¡Claro! Carpas la anoto para tu cotización.",
        extracted: ex,
        filled,
        msg: "¿Cuentan con carpas transparentes?",
        history: [
          ...h,
          { role: "user", content: "Serían 4 salas" },
          { role: "assistant", content: r1 },
          { role: "user", content: "maria.gomez@gopop.mx" },
          { role: "assistant", content: "Gracias por tu correo. ¿Qué tipo de evento es?" },
          { role: "user", content: "Fiesta de cumpleaños" },
        ],
      });
      if (!/s[ií]|contamos|manejamos/i.test(r2)) throw new Error(`no afirmó carpas: ${r2.slice(0, 250)}`);
      if (!/medidas?/i.test(r2)) throw new Error(`no pidió medidas: ${r2.slice(0, 250)}`);
      if (!/agreg|cotiz/i.test(r2)) throw new Error(`no ofreció agregar: ${r2.slice(0, 250)}`);
      notes.push(`carpas: ${r2.slice(0, 140)}…`);
      return notes;
    })
  );

  // ── 2. Núria: fiesta toscana + pastas/pizzas + post-cierre ────────────────
  results.push(
    check("R2: Núria A14894 — toscana + pastas/pizzas + No. Gracias", () => {
      const notes: string[] = [];
      if (parseTipoEventoFromText("Fiesta toscana") !== "fiesta") throw new Error("tipo fiesta");
      if (!clientMentionsItalianTheme("Fiesta toscana")) throw new Error("tema italiano");
      if (isValidRequerimientosValue("Quiero una cotización")) {
        throw new Error("cotización contó como requerimiento");
      }
      if (isGenericQuoteIntentRequerimiento("Quiero una cotización") !== true) {
        throw new Error("quote intent");
      }
      notes.push("cotización ≠ requerimiento; toscana=fiesta+italiano ✓");

      const svcs = parseServicesFromText("Solo barra de pastas y pizzas");
      if (svcs.length < 2 || !svcs.some((s) => /pasta/i.test(s)) || !svcs.some((s) => /pizza/i.test(s))) {
        throw new Error(`servicios: ${svcs.join(",")}`);
      }
      notes.push(`servicios: ${svcs.join(", ")}`);

      if (!clientDeclinesMoreServices("No. Gracias")) throw new Error("No. Gracias no es decline");

      const filled = new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Presupuesto (MXN)",
      ]);
      const reply = turn({
        ai: "¿Me regalas tu correo?",
        extracted: emptyExtracted({
          nombre: "Núria",
          correo: "nuria@example.com",
          tipo_evento: "fiesta",
          requerimientos_evento: "Barra de pastas, Barra de pizzas",
          direccion_evento: "Querétaro, El Marqués",
          fecha_horario: "Sin definir",
          num_invitados: 80,
          presupuesto: null,
        }),
        filled,
        msg: "No. Gracias",
        history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
        cierre: true,
        ready: true,
      });
      if (/correo|e-?mail/i.test(reply) && /\?/.test(reply)) {
        throw new Error(`reinició embudo: ${reply}`);
      }
      if (!/con gusto|equipo|aquí/i.test(reply)) throw new Error(`ack raro: ${reply}`);
      notes.push(`post-cierre: ${reply.slice(0, 100)}`);
      return notes;
    })
  );

  // ── 3. Graduación — ofrecimiento amplio Nivel 1 ──────────────────────────
  results.push(
    check("R3: Graduación — abanico Nivel 1 amplio", () => {
      const notes: string[] = [];
      const filled = new Set(["Nombre del cliente", "Correo electrónico"]);
      const reply = turn({
        ai: "¿Qué servicios quieres?",
        extracted: emptyExtracted({
          nombre: "Ximena",
          correo: "x@test.com",
          tipo_evento: "graduación",
        }),
        filled: new Set([...filled, "Tipo de evento"]),
        msg: "Es una graduación",
        history: [
          { role: "assistant", content: "¿Qué tipo de evento es?" },
          { role: "user", content: "graduación" },
        ],
      });
      const cats = [
        /alimento|banquete|taquiza|brunch/i,
        /bebida|barra/i,
        /mobiliario/i,
        /dj|iluminaci/i,
        /pista|tarima|carpa/i,
      ];
      const hits = cats.filter((re) => re.test(reply)).length;
      // May ask next field if req already somehow filled; prefer offer path
      const offerish = hits >= 3 || /manejamos|cotizar|gustar[ií]a/i.test(reply);
      if (!offerish && !mensajeAsksForField(reply, "requerimientos") && hits < 2) {
        // Accept if asking for services broadly
        if (!/servicio|pensado|necesitas/i.test(reply)) {
          throw new Error(`sin oferta ni ask servicios: ${reply.slice(0, 300)}`);
        }
      }
      notes.push(`hits categorías=${hits}; preview: ${reply.slice(0, 160)}…`);
      return notes;
    })
  );

  // ── 4. Embudo completo boda — orden sin dobles ───────────────────────────
  results.push(
    check("R4: Embudo boda — captura ordenada sin re-preguntar llenos", () => {
      const notes: string[] = [];
      const ex = emptyExtracted({
        nombre: "Ana",
        correo: "ana@test.com",
        tipo_evento: "boda",
        requerimientos_evento: "banquete",
        direccion_evento: "Polanco, CDMX",
        fecha_horario: "15 de agosto",
        num_invitados: 120,
        presupuesto: 80000,
      });
      const filled = new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]);
      if (!isReadyForClosing(filled)) throw new Error("debería estar listo para cierre");
      notes.push("checklist completo ✓");

      const reply = turn({
        ai: "¿En qué ciudad sería? ¿Me das tu correo?",
        extracted: ex,
        filled,
        msg: "sí",
        history: [{ role: "assistant", content: "¿Tienen presupuesto?" }],
        ready: true,
      });
      if (mensajeAsksForField(reply, "correo")) throw new Error("re-preguntó correo");
      if (mensajeAsksForField(reply, "zona")) throw new Error("re-preguntó zona");
      if (!reply.includes(CLOSING_SIGNATURE) && !/equipo|propuesta|cotizaci/i.test(reply)) {
        throw new Error(`sin cierre: ${reply.slice(0, 250)}`);
      }
      notes.push(`cierre/avance: ${reply.slice(0, 120)}…`);
      return notes;
    })
  );

  // ── 5. Pista/tarima — pide medidas ───────────────────────────────────────
  results.push(
    check("R5: Pista/tarima — pide medidas y no solo anota", () => {
      const notes: string[] = [];
      const reply = turn({
        ai: "ok",
        extracted: emptyExtracted({
          nombre: "Fer",
          correo: "f@test.com",
          tipo_evento: "xv años",
        }),
        filled: new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]),
        msg: "necesito una tarima",
        history: [{ role: "assistant", content: "¿Qué servicios te gustaría?" }],
      });
      if (!/tarima|pista/i.test(reply)) throw new Error(`sin mención: ${reply.slice(0, 200)}`);
      if (!/medidas?|tama[nñ]o|espacio/i.test(reply)) {
        throw new Error(`no pidió medidas: ${reply.slice(0, 250)}`);
      }
      notes.push(reply.slice(0, 180));

      const withDims = turn({
        ai: "ok",
        extracted: emptyExtracted({
          nombre: "Fer",
          correo: "f@test.com",
          tipo_evento: "xv años",
          requerimientos_evento: "pista de baile / tarima",
        }),
        filled: new Set([
          "Nombre del cliente",
          "Correo electrónico",
          "Tipo de evento",
          "Requerimientos o servicios",
        ]),
        msg: "el espacio es de 6 metros por 12 metros",
        history: [
          { role: "assistant", content: "¿Qué medidas aproximadas tiene el espacio?" },
        ],
      });
      if (!/6|12/i.test(withDims) && !mensajeAsksForField(withDims, "zona") && !mensajeAsksForField(withDims, "fecha")) {
        // Should advance funnel or ack dims
        if (!/anot|espacio|medida/i.test(withDims)) {
          throw new Error(`no avanzó con medidas: ${withDims.slice(0, 200)}`);
        }
      }
      notes.push(`con medidas → ${withDims.slice(0, 120)}…`);
      return notes;
    })
  );

  // ── 6. Anti-repetición global ────────────────────────────────────────────
  results.push(
    check("R6: Anti-repetición global outbound", () => {
      const notes: string[] = [];
      const same = "¿Me confirmas la ciudad o colonia del evento?";
      const anti = applyLucyGlobalAntiRepetition({
        mensaje: same,
        history: [{ role: "assistant", content: same }],
        filledSet: new Set(["Nombre del cliente"]),
        extracted: emptyExtracted({ nombre: "Test" }),
      });
      if (!anti.applied.length) throw new Error("no aplicó anti-repeat");
      if (anti.mensaje.trim() === same) throw new Error("reenvió idéntico");
      notes.push(`applied=${anti.applied.join(",")}; → ${anti.mensaje.slice(0, 80)}`);

      const thanks =
        "¡Con gusto, Núria! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.";
      const t2 = applyLucyGlobalAntiRepetition({
        mensaje: thanks,
        history: [{ role: "assistant", content: thanks }],
        cierreYaEnviado: true,
        clientName: "Núria",
      });
      if (!t2.applied.includes("postcierre-thanks-dedupe")) {
        throw new Error(`thanks dedupe: ${t2.applied}`);
      }
      notes.push("post-cierre thanks dedupe ✓");
      return notes;
    })
  );

  // ── 7. RFQ B2B Alejandra — no SKU suelto ─────────────────────────────────
  results.push(
    check("R7: RFQ B2B — brief rico sin precio SKU inventado", () => {
      const notes: string[] = [];
      const brief =
        "Evento corporativo 15 agosto Santa Fe 200 personas. Mobiliario, meseros, parrillada y menú casual. Precio para distribuidor.";
      const reply = turn({
        ai: "El Premium sale en $930 /pp.",
        extracted: emptyExtracted({
          nombre: "Alejandra",
          correo: "a@puntodeimagen.mx",
          tipo_evento: "evento corporativo",
          requerimientos_evento: "Mobiliario, Meseros, Parrillada, Menú Casual",
          direccion_evento: "Santa Fe, Ciudad de México",
          fecha_horario: "15 de agosto",
          num_invitados: 200,
        }),
        filled: new Set([
          "Nombre del cliente",
          "Correo electrónico",
          "Tipo de evento",
          "Requerimientos o servicios",
          "Lugar/dirección del evento",
          "Fecha y horario",
          "Número de invitados",
        ]),
        msg: brief,
        history: [],
        ready: false,
      });
      if (/\$\s*930/i.test(reply)) throw new Error(`filtró mal SKU: ${reply.slice(0, 300)}`);
      notes.push(`sin $930 ✓; preview: ${reply.slice(0, 140)}…`);
      return notes;
    })
  );

  // ── 8. Humano Trabaja — código de silencio + post-cierre teléfonos ────────
  results.push(
    check("R8: Humano Trabaja — silencio en código + teléfonos emergencia", () => {
      const notes: string[] = [];
      const src = readFileSync("/workspace/api-server/src/services/embudo.ts", "utf8");
      if (!/export function lucyEstaEnSilencio/.test(src)) {
        throw new Error("falta lucyEstaEnSilencio");
      }
      if (!/export function lucyDebeResponder/.test(src)) {
        throw new Error("falta lucyDebeResponder");
      }
      if (!/HUMANO_TRABAJA/.test(src)) throw new Error("falta stage HUMANO_TRABAJA");
      notes.push("embudo.ts: silencio + HUMANO_TRABAJA ✓");

      const kommo = readFileSync("/workspace/api-server/src/routes/kommo.ts", "utf8");
      if (!/handleLucyInactiveInbound/.test(kommo)) {
        throw new Error("falta handleLucyInactiveInbound");
      }
      if (!/captureInboundWhileLucyInactive/.test(kommo)) {
        throw new Error("falta capture inbound en silencio");
      }
      notes.push("kommo: vigilancia silenciosa de inbound ✓");

      const phone = turn({
        ai: "ok",
        extracted: emptyExtracted({ nombre: "Alejandra", correo: "a@test.com" }),
        filled: new Set([
          "Nombre del cliente",
          "Correo electrónico",
          "Tipo de evento",
          "Requerimientos o servicios",
          "Lugar/dirección del evento",
          "Fecha y horario",
          "Número de invitados",
          "Presupuesto (MXN)",
        ]),
        msg: "me pueden marcar por favor",
        history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
        cierre: true,
        ready: true,
      });
      if (!/4008|4671|asesor|tel[eé]fono|marcar|llamar/i.test(phone)) {
        throw new Error(`sin teléfonos: ${phone.slice(0, 250)}`);
      }
      notes.push(`callback: ${phone.slice(0, 100)}…`);

      const afterThanks = turn({
        ai: "Perfecto, ya tengo todo otra vez",
        extracted: emptyExtracted({ nombre: "Alejandra" }),
        filled: new Set([
          "Nombre del cliente",
          "Correo electrónico",
          "Tipo de evento",
          "Requerimientos o servicios",
          "Lugar/dirección del evento",
          "Fecha y horario",
          "Número de invitados",
          "Presupuesto (MXN)",
        ]),
        msg: "Gracias",
        history: [{ role: "assistant", content: buildPhoneAnswer() }],
        cierre: true,
        ready: true,
      });
      if (afterThanks.includes(CLOSING_SIGNATURE)) {
        throw new Error("repitió cierre tras gracias");
      }
      notes.push("gracias post-teléfono no reinicia cierre ✓");
      return notes;
    })
  );

  // ── 9. Sanitize CRM — producto/cotización no contaminan ──────────────────
  results.push(
    check("R9: Sanitize CRM — Luxor/cotización no contaminan campos", () => {
      const notes: string[] = [];
      const clean = sanitizeExtractedFromExternal({
        ...emptyExtracted(),
        nombre: "Maria",
        direccion_evento: "Luxor Rosa",
        requerimientos_evento: "Quiero una cotización",
        num_invitados: 4,
      });
      if (clean.direccion_evento !== null) throw new Error("Luxor quedó en dirección");
      if (clean.requerimientos_evento !== null) {
        throw new Error(`cotización quedó en req: ${clean.requerimientos_evento}`);
      }
      notes.push("dirección Luxor limpiada ✓");
      notes.push("requerimiento cotización limpiado ✓");
      if (isLikelyProductNameNotLocation("Luxor Rosa") !== true) throw new Error("product detector");
      notes.push("detector producto ✓");
      return notes;
    })
  );

  // ── 10. Zona Querétaro + El Marqués + fecha sin doble ────────────────────
  results.push(
    check("R10: Zona Querétaro→El Marqués + anti-doble fecha", () => {
      const notes: string[] = [];
      const z1 = parseZonaFromText("Querétaro");
      const z2 = parseZonaFromText("El Marques");
      if (!z1 || !/quer/i.test(z1)) throw new Error(`Querétaro: ${z1}`);
      if (!z2 || !/marqu/i.test(z2)) throw new Error(`El Marques: ${z2}`);
      notes.push(`zonas: ${z1} / ${z2}`);

      const ex = emptyExtracted({
        nombre: "Núria",
        correo: "n@test.com",
        tipo_evento: "fiesta",
        requerimientos_evento: "pastas",
        direccion_evento: "Querétaro",
      });
      const filled = new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]);
      // Con ciudad en extracted, no debe forzar otra zona al pedir fecha
      const reply = turn({
        ai: "¿Me confirmas la colonia del evento?",
        extracted: ex,
        filled,
        msg: "Querétaro",
        history: [{ role: "assistant", content: "¿En qué ciudad sería el evento?" }],
      });
      const pending = getNextPendingField(ex, filled);
      notes.push(`pending tras Querétaro usable: ${pending}`);
      // Should not insist zona if extracted has usable city — either advances or variant
      if (mensajeAsksForField(reply, "zona") && /colonia del evento/i.test(reply) && isUsableDireccionEvento(ex.direccion_evento)) {
        // syncFilled should mark zona — check after turn mutation
        notes.push(`reply aún pregunta zona (revisar): ${reply.slice(0, 100)}`);
      }
      // Fecha anti-doble via anti-repeat
      const f1 = "¿Qué fecha y horario tienen en mente?";
      const anti = applyLucyGlobalAntiRepetition({
        mensaje: f1,
        history: [{ role: "assistant", content: f1 }],
        extracted: ex,
        filledSet: filled,
      });
      if (anti.mensaje.trim() === f1) throw new Error("fecha idéntica no filtrada");
      notes.push(`anti-doble fecha applied=${anti.applied.join(",")}`);
      return notes;
    })
  );

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return {
    summary: {
      total: results.length,
      passed,
      failed,
      live_expected_prompt: "V8.10",
      timestamp: new Date().toISOString(),
    },
    results,
  };
}
