/**
 * 10 escenarios de prueba del flujo Lucy (sin OpenAI).
 * Ejecutar: pnpm run selftest
 */
import assert from "node:assert/strict";
import type { OpenAI } from "openai";
import {
  parsePresupuestoFromText,
  parseInvitadosFromText,
  clientMentionsCatering,
  clientMentionsEntertainment,
  clientMentionsPistaTarima,
  isDimensionText,
  parseSpaceDimensions,
  parseZonaFromText,
  parseFechaFromText,
  parseCorreoFromText,
  isServiceLabelNotTipoEvento,
  clientAsksPhone,
  clientAsksForRecommendations,
  parsePrimaryService,
  scanConversationForCaptures,
  captureContextualAnswer,
  applyCapturesToCrm,
  clientAsksAboutTeam,
  inferLucyAskedField,
  isServiceRelatedMessage,
  detectPresupuestoRefusal,
} from "../conversation-understanding.js";
import { isQuoteIntentMessage, sanitizeDisplayName, sanitizeCrmNombre } from "../contact-name.js";
import { advisorLabelForClient, normalizeAdvisorReferences } from "../lib/bodasesorAdvisor.js";
import { buildResumenClienteLargo } from "../services/summaryService.js";
import {
  applyLucyMessageGuards,
  applyEmailWaiver,
  applyPresupuestoWaiver,
  buildPhoneAnswer,
  buildRecommendationsReply,
  buildPostCierreThanksReply,
  clientSaysThanks,
  CLOSING_CORE_FIELDS,
  detectEmailRefusal,
  EMAIL_WAIVED_LABEL,
  getNextPendingField,
  isReadyForClosing,
  mensajeAsksForFilledField,
  LUCY_INTRO,
  isValidRequerimientosValue,
} from "../lucy-flow-guards.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCatalogStatus } from "../services/catalogService.js";
import type { ExtractedData } from "../types.js";

const CATALOG_URL =
  "https://cdn.shopify.com/s/files/1/0809/1215/4936/files/Catalogo-Menus-Bodasesor-2026_4_b5efa97c-ce47-4bef-b189-aca2d91fefa7.pdf";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (err: unknown) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${name}:`, msg);
    process.exitCode = 1;
  }
}

function emptyExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
  return {
    nombre: null,
    telefono: null,
    correo: null,
    presupuesto: null,
    direccion_evento: null,
    requerimientos_evento: null,
    fecha_horario: null,
    num_invitados: null,
    tipo_evento: null,
    tipo_contacto: "cliente",
    empresa: null,
    ...overrides,
  };
}

function mockClosing(servicios: string | null | undefined, clientName?: string | null): string {
  const advisor = advisorLabelForClient(clientName);
  const handoff =
    advisor === "nuestro equipo"
      ? "Le paso estos datos a nuestro equipo para que te arme una cotización personalizada."
      : `Le paso estos datos a ${advisor} para que te arme una cotización personalizada.`;
  return `Perfecto, ya tengo todo. ${handoff}\n\nMientras tanto, aquí está nuestro catálogo completo:\n${CATALOG_URL}\n\nServicios: ${servicios ?? "varios"}`;
}

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  readyForClosing: boolean;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  emailRefusedThisTurn?: boolean;
  debugLogs?: string[];
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: opts.readyForClosing,
    cierreYaEnviado: false,
    emailRefusedThisTurn: opts.emailRefusedThisTurn ?? false,
    history: opts.history ?? [],
    currentMessage: opts.currentMessage,
    buildClosing: mockClosing,
    log: opts.debugLogs
      ? {
          info: (_o, msg) => {
            if (msg) opts.debugLogs!.push(msg);
          },
          warn: (_o, msg) => {
            if (msg) opts.debugLogs!.push(`WARN:${msg}`);
          },
        }
      : undefined,
  });
}

async function runAll(): Promise<void> {
  console.log("Lucy — 18 escenarios de prueba\n");

  await test('1. A14754 — "Busco comida" ofrece banquete/taquiza', () => {
    const filled = new Set(["Nombre del cliente", EMAIL_WAIVED_LABEL, "Tipo de evento"]);
    const extracted = emptyExtracted({ nombre: "Alejandro", tipo_evento: "cumpleaños" });
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Qué servicios te gustaría cotizar para la fiesta de cumpleaños?" },
    ];
    const lastLucy = history[0]!.content as string;
    assert.equal(inferLucyAskedField(lastLucy), "requerimientos");
    assert.ok(clientMentionsCatering("Busco comida"));
    assert.ok(isServiceRelatedMessage("Busco comida"));

    const debugLogs: string[] = [];
    const reply = runGuards({
      aiResponse: "¿Cuántos invitados?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Busco comida",
      history,
      debugLogs,
    });
    if (!/banquete|taquiza|catering|alimentos/i.test(reply)) {
      throw new Error(`respuesta inesperada: "${reply.slice(0, 200)}" | logs: ${debugLogs.join(" > ")}`);
    }
    assert.equal(parsePrimaryService("Busco comida"), "banquete / taquiza");
  });

  await test("2. Cliente Alejandro — cierre dice nuestro equipo, no Alejandro asesor", () => {
    const filled = new Set<string>([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Presupuesto (MXN)",
    ]);
    const extracted = emptyExtracted({
      nombre: "Alejandro",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "banquete / taquiza",
      num_invitados: 60,
      direccion_evento: "CDMX",
      fecha_horario: "en 2 meses",
      presupuesto: 80000,
    });
    assert.equal(isReadyForClosing(filled), true);
    const reply = runGuards({
      aiResponse: "Información completa obtenida.",
      extracted,
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "En 2 meses",
    });
    assert.ok(reply.includes("Perfecto, ya tengo todo"));
    assert.ok(reply.includes("nuestro equipo"));
    assert.ok(!/pasar.*a Alejandro/i.test(reply));
    assert.ok(reply.includes(CATALOG_URL));
  });

  await test("3. 60 invitados no marca presupuesto ni cierra el embudo", () => {
    assert.equal(parsePresupuestoFromText("60"), null);
    assert.equal(parseInvitadosFromText("60"), "60");

    const caps = scanConversationForCaptures([], "60", new Set());
    assert.equal(caps.find((c) => c.label === "Presupuesto (MXN)"), undefined);
    assert.equal(caps.find((c) => c.label === "Número de invitados")?.value, "60");

    const filled = new Set<string>([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    assert.equal(isReadyForClosing(filled), false);
    assert.equal(getNextPendingField(emptyExtracted({ num_invitados: 60 }), filled), "presupuesto");
  });

  await test('4. "Por este medio está bien" — waiver de correo y sin re-preguntar', () => {
    assert.ok(detectEmailRefusal(["Por este medio está bien"]));
    const merged: string[] = [];
    const filled = new Set<string>(["Nombre del cliente"]);
    applyEmailWaiver(filled, merged, ["Por este medio está bien"]);
    assert.ok(filled.has(EMAIL_WAIVED_LABEL));

    const extracted = emptyExtracted({ nombre: "Ana" });
    const reply = runGuards({
      aiResponse: "¿Me das tu correo?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Por este medio está bien",
      emailRefusedThisTurn: true,
      history: [{ role: "assistant", content: "¿A qué correo te lo envío?" }],
    });
    assert.ok(!/correo/i.test(reply) || /seguimos por aquí/i.test(reply));
    assert.ok(/cumpleaños|evento|festejan|tipo/i.test(reply));
  });

  await test("5. Pregunta teléfonos — ventas solo llamada, gerencia con WhatsApp", () => {
    assert.ok(clientAsksPhone("¿Tienen teléfono de ventas?"));
    const phone = buildPhoneAnswer();
    assert.ok(/4008\s*0373/.test(phone));
    assert.ok(/4671\s*0585/.test(phone));
    assert.ok(/sin WhatsApp/i.test(phone));
    assert.ok(/Gerencia.*WhatsApp/is.test(phone));

    const filled = new Set(["Nombre del cliente", EMAIL_WAIVED_LABEL, "Tipo de evento"]);
    const reply = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Luis", tipo_evento: "boda" }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "¿Tienen teléfono? Nadie contesta",
    });
    assert.ok(/4008|4671/.test(reply));
    assert.ok(/sin WhatsApp/i.test(reply));
  });

  await test('6. "No sé aún" en invitados — captura sin re-preguntar invitados', () => {
    const inv = parseInvitadosFromText("No sé aún");
    assert.ok(inv?.includes("Sin definir"));

    const filled = new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const merged: string[] = [];
    const caps = captureContextualAnswer(
      [{ role: "assistant", content: "¿Más o menos para cuántas personas sería?" }],
      "No sé aún",
      filled
    );
    applyCapturesToCrm(merged, filled, caps);
    assert.ok(filled.has("Número de invitados"));
    assert.equal(getNextPendingField(emptyExtracted(), filled), "zona");
  });

  await test("7. Boda — recomendaciones mencionan banquete/taquiza y catálogo", () => {
    assert.ok(clientAsksForRecommendations("¿Qué me recomiendas para mi boda?"));
    const reply = buildRecommendationsReply(
      emptyExtracted({ tipo_evento: "boda" }),
      [],
      1,
      "¿Qué me recomiendas?"
    );
    assert.ok(/banquete|taquiza/i.test(reply));
    assert.ok(/bebidas|mobiliario|DJ|iluminaci/i.test(reply));
  });

  await test("8. Secuencia 60 pax + presupuesto 80k — sin contaminar campos", () => {
    const filled = new Set<string>();
    const merged: string[] = [];

    applyCapturesToCrm(merged, filled, scanConversationForCaptures([], "60", filled));
    assert.equal(merged.find((l) => l.includes("invitados"))?.includes("60"), true);
    assert.equal(merged.find((l) => l.includes("Presupuesto")), undefined);

    const capsPres = captureContextualAnswer(
      [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
      "80000",
      filled
    );
    applyCapturesToCrm(merged, filled, capsPres);
    assert.ok(filled.has("Presupuesto (MXN)"));
    assert.ok(merged.some((l) => /Presupuesto.*80000/i.test(l)));

    const extracted = emptyExtracted({ num_invitados: 60, presupuesto: 80000 });
    assert.notEqual(extracted.presupuesto, extracted.num_invitados);
  });

  await test("9. Resumen largo — sin emojis, servicios reales, no confunde tipo", () => {
    const text = buildResumenClienteLargo(
      emptyExtracted({
        nombre: "Alejandro",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "banquete / taquiza",
        num_invitados: 60,
        direccion_evento: "CDMX",
        fecha_horario: "en 2 meses",
        presupuesto: 80000,
      }),
      [
        "- Nombre del cliente: Alejandro",
        "- Correo (prefiere no compartir): continuar por WhatsApp/chat",
        "- Tipo de evento: cumpleaños",
        "- Requerimientos o servicios: banquete / taquiza",
        "- Número de invitados: 60",
        "- Lugar/dirección del evento: CDMX",
        "- Fecha y horario: en 2 meses",
        "- Presupuesto (MXN): 80000",
      ],
      "cumpleaños busco comida 60 CDMX en 2 meses"
    );
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(text), "contiene emojis");
    assert.ok(text.includes("banquete"));
    assert.ok(text.includes("Invitados: 60"));
    assert.ok(text.includes("CDMX"));
    assert.ok(!text.includes("Servicios / requerimientos: cumpleaños"));
    assert.ok(text.includes("continúa por WhatsApp"));
  });

  await test("10. Integraciones — módulos conectados y features activas", () => {
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    const healthSrc = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.ok(mirrorSrc.includes("deliverLucyOutbound"));
    assert.ok(mirrorSrc.includes("sendWhatsAppDirect"));
    assert.ok(healthSrc.includes('mode: "meta_plus_note"'));

    const catalog = getCatalogStatus();
    assert.equal(typeof catalog.loaded, "boolean");
    assert.ok(catalog.sources);
    assert.equal(typeof catalog.sources.sheets, "boolean");

    assert.equal(CLOSING_CORE_FIELDS.length, 7);
    assert.ok(LUCY_INTRO.includes("Lucy"));
    assert.ok(isValidRequerimientosValue("banquete"));
    assert.ok(!isValidRequerimientosValue("cumpleaños"));

    assert.equal(clientAsksAboutTeam("Alejandro", "Alejandro"), false);
    assert.equal(clientAsksAboutTeam("¿Quién es Alejandro?", "María"), true);

    const norm = normalizeAdvisorReferences(
      "Le paso estos datos a Alejandro para que te arme una cotización.",
      "Alejandro"
    );
    assert.ok(norm.includes("nuestro equipo"));

    const healthFeatures = [
      "understanding",
      "redaction-briefing",
      "training-db",
      "lucy-admin",
      "debounce-5s",
      "learning-from-human-chats",
      "knowledge-gaps-aprendizaje",
    ];
    assert.equal(healthFeatures.length, 7);
  });

  await test('11. Bakar — "Quiero cotización" NO es nombre', () => {
    assert.equal(isQuoteIntentMessage("Quiero hacer una cotizacion"), true);
    assert.equal(sanitizeDisplayName("Quiero hacer una cotizacion"), null);
    assert.equal(sanitizeDisplayName("Quiero"), null);

    const filled = new Set<string>();
    const caps = captureContextualAnswer([], "Quiero hacer una cotizacion", filled);
    assert.equal(caps.find((c) => c.label === "Nombre del cliente"), undefined);
  });

  await test('12. Bakar — "no" en presupuesto no repite bucle', () => {
    assert.ok(detectPresupuestoRefusal("no"));
    assert.ok(detectPresupuestoRefusal("no no tengo presupuesto, no me brindaron"));
    assert.equal(
      parsePresupuestoFromText("no", { askedField: "presupuesto" }),
      "Sin definir (cliente indicó que no tiene)"
    );

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    const merged: string[] = [];
    applyPresupuestoWaiver(filled, merged, ["no"]);
    assert.ok(filled.has("Presupuesto (MXN)"));
    assert.equal(isReadyForClosing(filled), true);

    const extracted = emptyExtracted({
      nombre: "Bakar",
      correo: "compras1@scabakar.com",
      tipo_evento: "evento corporativo",
      requerimientos_evento: "show grupo versatil",
      num_invitados: 30,
      direccion_evento: "Club de Golf Mexico",
      fecha_horario: "18 de diciembre a las 20:00 horas",
    });
    const reply = runGuards({
      aiResponse: "¿Tienen presupuesto estimado?",
      extracted,
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "no",
      history: [{ role: "assistant", content: "¿Tienen algún presupuesto estimado en mente?" }],
    });
    assert.ok(reply.includes("Perfecto, ya tengo todo") || !/presupuesto/i.test(reply));
  });

  await test("13. Bakar — show de grupo versátil ofrece entretenimiento", () => {
    assert.ok(clientMentionsEntertainment("requerimos un show de grupo versatil"));
    const filled = new Set(["Nombre del cliente", "Correo electrónico"]);
    const extracted = emptyExtracted({ nombre: "Bakar", correo: "compras1@scabakar.com" });
    const msg =
      "requerimos un show de grupo versatil para el dia 18 de diciembre a las 20:00 horas para un grupo de 30 personas";
    const reply = runGuards({
      aiResponse: "¿Qué tipo de evento?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: msg,
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría cotizar?" }],
    });
    assert.ok(/show|animaci|hora\s+loca|entretenimiento|vers[aá]til/i.test(reply), reply.slice(0, 150));
  });

  await test("14. Fer A14756 — pista/tarima ofrece orientación de venta", () => {
    assert.ok(clientMentionsPistaTarima("quiero cotizar una pista de baile o tarima"));
    const filled = new Set<string>();
    const extracted = emptyExtracted();
    const reply = runGuards({
      aiResponse: "¿Me regalas tu nombre?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Hola, me gustaría cotizar una pista de baile o tarima para mi evento",
      history: [],
    });
    assert.ok(/pista|tarima|iluminada|tamaño/i.test(reply), reply.slice(0, 200));
  });

  await test("15. Fer A14756 — 6m x 12m NO es ubicación", () => {
    assert.ok(isDimensionText("Son 50 personas. El espacio es de 6 metros por 12"));
    assert.equal(parseZonaFromText("6 metros por 12"), null);
    assert.equal(parseSpaceDimensions("El espacio es de 6 metros por 12"), "6m x 12m");

    const filled = new Set<string>(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const merged: string[] = [];
    const caps = [
      ...captureContextualAnswer(
        [{ role: "assistant", content: "¿Más o menos para cuántas personas sería?" }],
        "Son 50 personas. El espacio es de 6 metros por 12",
        filled
      ),
      ...scanConversationForCaptures(
        [{ role: "user", content: "Hola, quiero cotizar una pista de baile o tarima" }],
        "Son 50 personas. El espacio es de 6 metros por 12",
        filled
      ),
    ];
    applyCapturesToCrm(merged, filled, caps);
    assert.ok(merged.some((l) => /invitados.*50/i.test(l)));
    assert.ok(!merged.some((l) => /Lugar\/dirección/i.test(l)));
    assert.ok(
      merged.some((l) => /Requerimientos.*6m x 12m|espacio 6m/i.test(l)) ||
        caps.some((c) => /6m x 12m|espacio/i.test(c.value))
    );
  });

  await test('16. Fer A14756 — presupuesto económico y "gracias" post-cierre', () => {
    assert.equal(parsePresupuestoFromText("Lo más económico posible"), "Opciones económicas (sin monto fijo)");
    assert.ok(detectPresupuestoRefusal("No tengo rango ee comparación"));

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "ferramlun2206@gmail.com",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Pista de baile (espacio 6m x 12m)",
      num_invitados: 50,
      fecha_horario: "15 de julio",
    });
    const ecoReply = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Lo más económico posible",
      history: [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
    });
    assert.ok(!/rango de presupuesto/i.test(ecoReply), ecoReply.slice(0, 200));
    assert.ok(/econ[oó]mic/i.test(ecoReply));

    const thanksFilled = new Set([...filled, "Presupuesto (MXN)", "Lugar/dirección del evento"]);
    const thanksReply = applyLucyMessageGuards({
      aiResponse: "",
      extracted,
      filledSet: thanksFilled,
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
      currentMessage: "Muchas gracias",
      buildClosing: mockClosing,
    });
    assert.ok(thanksReply.trim().length > 0, "respuesta vacía");
    assert.ok(clientSaysThanks("Muchas gracias"));
    assert.ok(buildPostCierreThanksReply("Fer").includes("Fer"));

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    assert.ok(mirrorSrc.includes("texto vacío"));
  });

  await test("17. Fer A14751 — brunch baby shower, correo, fecha y presupuesto sin bucles", () => {
    assert.equal(isQuoteIntentMessage("Quiero hacer una cotizacion"), true);
    assert.equal(sanitizeDisplayName("Quiero"), null);
    assert.ok(clientMentionsCatering("Brunch/ desayuno para 35 personas"));
    assert.ok(isServiceLabelNotTipoEvento("brunch"));
    assert.equal(parseCorreoFromText("Si fer.barrientost2892@gmail.com"), "fer.barrientost2892@gmail.com");
    assert.equal(parseFechaFromText("Todavía la vamos a definir"), "Sin definir (pendiente)");
    assert.ok(parseFechaFromText("Yo creo que x octubre")?.includes("octubre"));
    assert.equal(
      parsePresupuestoFromText("Tu mándame el presupuesto y si quieres vemos"),
      "Sin definir (cliente pidió que propongamos)"
    );

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "fer.barrientost2892@gmail.com",
      tipo_evento: "baby shower",
      requerimientos_evento: "Brunch",
      num_invitados: 35,
      direccion_evento: "Jardines del pedregal",
      fecha_horario: "Sin definir (pendiente)",
    });

    const presFilled = new Set(filled);
    const presReply = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted,
      filledSet: presFilled,
      readyForClosing: false,
      currentMessage: "Tu mándame el presupuesto y si quieres vemos",
      history: [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
    });
    assert.ok(!/rango de presupuesto/i.test(presReply), presReply.slice(0, 200));

    const fechaFilled = new Set(filled);
    const fechaAi = "¿Ya hay día definido o siguen viendo opciones?";
    assert.ok(mensajeAsksForFilledField(fechaAi, fechaFilled, extracted), "debe detectar fecha repetida");
    const fechaReply = runGuards({
      aiResponse: fechaAi,
      extracted,
      filledSet: fechaFilled,
      readyForClosing: false,
      currentMessage: "Todavía la vamos a definir",
      history: [{ role: "assistant", content: "¿Ya tienen fecha o todavía la van definiendo?" }],
    });
    if (/fecha|d[ií]a definido/i.test(fechaReply) && !/presupuesto/i.test(fechaReply)) {
      throw new Error(`fechaReply inesperada: ${fechaReply.slice(0, 200)}`);
    }

    const brunchFilled = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const brunchReply = runGuards({
      aiResponse: "¿A qué correo te mando la información?",
      extracted: emptyExtracted({ nombre: "Fer", tipo_evento: "baby shower" }),
      filledSet: brunchFilled,
      readyForClosing: false,
      currentMessage: "Brunch/ desayuno para 35 personas",
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría cotizar?" }],
    });
    assert.ok(/brunch|banquete|taquiza|desayuno|alimentos/i.test(brunchReply), brunchReply.slice(0, 200));
    assert.ok(!/correo/i.test(brunchReply), "no debe re-preguntar correo ya capturado");
  });

  await test("18. Verónica A14760 — por aquí sin correo, sin Alejandro, nombre completo", () => {
    assert.ok(detectEmailRefusal(["Si me la pueden mandar por aquí porfa"]));
    assert.equal(sanitizeCrmNombre("Verónica Camarillo"), "Verónica Camarillo");
    assert.equal(sanitizeDisplayName("Verónica Camarillo"), "Verónica");

    const merged: string[] = ["- Nombre del cliente: Verónica"];
    const filled = new Set<string>(["Nombre del cliente"]);
    applyEmailWaiver(filled, merged, ["Si me la pueden mandar por aquí porfa"]);
    assert.ok(filled.has(EMAIL_WAIVED_LABEL));

    const extracted = emptyExtracted({ nombre: "Verónica Camarillo", tipo_evento: "cumpleaños" });
    const reply = runGuards({
      aiResponse:
        "Claro, Verónica. ¿Me podrías compartir tu correo para enviarte la información y que Alejandro te arme la propuesta?",
      extracted,
      filledSet: new Set([...filled, "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "Si me la pueden mandar por aquí porfa",
      emailRefusedThisTurn: true,
      history: [{ role: "assistant", content: "¿A qué correo te lo envío?" }],
    });
    assert.ok(!/correo/i.test(reply), reply.slice(0, 200));
    assert.ok(!/Alejandro/i.test(reply), reply);
    assert.ok(/seguimos por aquí|invitados|servicios|pensado/i.test(reply), reply.slice(0, 200));

    const norm = normalizeAdvisorReferences(
      "para que Alejandro te arme la propuesta",
      "Verónica"
    );
    assert.ok(norm.includes("nuestro equipo"));
    assert.ok(!/Alejandro/i.test(norm));
  });

  console.log(`\n${passed} OK, ${failed} fallidas de ${passed + failed} escenarios`);
  if (failed > 0) process.exit(1);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
