/**
 * Heurísticas $0 para el auditor Lucy (sin LLM).
 */

export type HeuristicFinding = {
  category: "loop_links" | "repeat_reply" | "premature_close" | "bad_field" | "stuck_funnel";
  severity: "info" | "warn" | "error";
  evidence: string;
  proposedRepair: string;
};

export type TranscriptTurn = { role: "user" | "assistant" | string; content: string };

/** Snapshot de campos CRM que Lucy escribe en el panel Kommo. */
export type CrmFieldSnapshot = {
  tipo_evento?: string | null;
  requerimientos?: string | null;
  fecha_evento?: string | null;
  horario_evento?: string | null;
  num_invitados?: string | null;
  presupuesto?: string | null;
  direccion?: string | null;
  resumen_ia?: string | null;
};

/** Lucy o respuesta saliente (a veces Kommo la marca como human/internal). */
function isOutgoing(t: TranscriptTurn): boolean {
  const r = String(t.role ?? "").toLowerCase();
  return r === "assistant" || r === "human" || r === "bot" || r === "lucy";
}

function isClient(t: TranscriptTurn): boolean {
  const r = String(t.role ?? "").toLowerCase();
  return r === "user" || r === "client" || r === "customer";
}

const URL_RE = /https?:\/\/[^\s)]+/gi;
const CLOSE_RE = /\bya tengo todo\b|\bcotizaci[oó]n personalizada\b/i;
const PRICE_RE = /\b(precio|costo|cu[aá]nto\s+cuesta|cotiz)/i;
const DETAIL_RE = /\b(detalle|detalles|opci[oó]n\s+de\s+alimentos|qu[eé]\s+incluye)/i;
const FUNNEL_Q_RE =
  /\b(cu[aá]ntos?\s+invitados|qu[eé]\s+d[ií]a|a\s+qu[eé]\s+hora|en\s+qu[eé]\s+ciudad|correo|presupuesto|qu[eé]\s+van\s+a\s+celebrar|regalas?\s+tu\s+nombre)/i;
const RESUMEN_IA_CIERRE = "Actualizado por Lucy en cada mensaje";

type FunnelSlot = "invitados" | "fecha" | "hora" | "ciudad" | "correo" | "presupuesto" | "tipo" | "nombre";

function funnelSlotOf(match: string): FunnelSlot {
  const m = match.toLowerCase();
  if (/invitados/.test(m)) return "invitados";
  if (/d[ií]a/.test(m)) return "fecha";
  if (/hora/.test(m)) return "hora";
  if (/ciudad/.test(m)) return "ciudad";
  if (/correo/.test(m)) return "correo";
  if (/presupuesto/.test(m)) return "presupuesto";
  if (/celebrar/.test(m)) return "tipo";
  return "nombre";
}

const MONTH_RE = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

/** ¿El cliente ya dio este dato en su mensaje? Solo slots con señal inequívoca. */
function clientAnsweredSlot(slot: FunnelSlot, text: string): boolean {
  const t = text.trim();
  switch (slot) {
    case "correo":
      return /[\w.+-]+@[\w-]+\.[\w.]+/.test(t);
    case "invitados":
      return (
        /\b\d{2,4}\s*(personas|invitados|pax|gentes?)\b/i.test(t) ||
        /^(?:(?:como|aprox\w*|unos?|unas)\s+)?\d{2,4}\s*(?:personas|invitados|pax)?\.?$/i.test(t)
      );
    case "fecha":
      return MONTH_RE.test(t) || /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(t);
    default:
      return false;
  }
}

/** Solape de palabras (>3 letras) entre dos respuestas, 0..1. */
function wordOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      normalizeText(s)
        .split(" ")
        .filter((w) => w.length > 3)
    );
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size);
}

function normalizeText(t: string): string {
  return t
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "URL")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function extractUrls(t: string): string[] {
  return [...(t.match(URL_RE) ?? [])].map((u) => u.replace(/[.,;!?)]+$/, ""));
}

function similar(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 40 && nb.includes(na.slice(0, 60))) return true;
  if (nb.length > 40 && na.includes(nb.slice(0, 60))) return true;
  return false;
}

/** Exportado para smoke. */
export function runAuditorHeuristics(turns: TranscriptTurn[]): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];
  const assistants = turns.filter((t) => isOutgoing(t) && t.content?.trim());
  const users = turns.filter((t) => isClient(t) && t.content?.trim());

  // loop_links: mismas URLs en 2+ replies consecutivas/cercanas
  for (let i = 1; i < assistants.length; i++) {
    const prev = extractUrls(assistants[i - 1]!.content);
    const cur = extractUrls(assistants[i]!.content);
    if (prev.length === 0 || cur.length === 0) continue;
    const overlap = cur.filter((u) => prev.some((p) => p === u));
    if (overlap.length >= 1 && similar(assistants[i - 1]!.content, assistants[i]!.content)) {
      findings.push({
        category: "loop_links",
        severity: "warn",
        evidence: `Lucy repitió links (${overlap.slice(0, 2).join(", ")}) en respuestas seguidas.`,
        proposedRepair:
          "Evitar reenviar el mismo catálogo/link si el cliente pide detalle o precio; responder con solo/completo o Sheet.",
      });
      break;
    }
  }

  // repeat_reply: mismo cuerpo casi completo, no solo el mismo arranque.
  for (let i = 1; i < assistants.length; i++) {
    const a = assistants[i - 1]!.content;
    const b = assistants[i]!.content;
    if (normalizeText(b).length < 40) continue;
    if (normalizeText(a) === normalizeText(b) || wordOverlap(a, b) >= 0.8) {
      findings.push({
        category: "repeat_reply",
        severity: "warn",
        evidence: `Respuesta casi idéntica repetida: «${normalizeText(assistants[i]!.content).slice(0, 120)}…»`,
        proposedRepair:
          "Anti-repeat: no volver a emitir el mismo cuerpo; avanzar embudo o dar detalle nuevo.",
      });
      break;
    }
  }

  // premature_close
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    if (t.role !== "assistant" || !CLOSE_RE.test(t.content)) continue;
    const prevUser = [...turns.slice(0, i)].reverse().find((x) => x.role === "user");
    if (prevUser && (PRICE_RE.test(prevUser.content) || DETAIL_RE.test(prevUser.content))) {
      findings.push({
        category: "premature_close",
        severity: "error",
        evidence: `Cierre «ya tengo todo» tras cliente pedir precio/detalle: «${prevUser.content.slice(0, 100)}»`,
        proposedRepair:
          "No cerrar si clientAsksPrice / clientAsksNamedServiceDetail; responder Sheet o solo vs completo.",
      });
      break;
    }
  }

  // bad_field: cena conmemorativa tratada como SKU en reply Level-2
  for (const a of assistants) {
    if (/no lo tengo listado/i.test(a.content) && /\bcena\b/i.test(a.content)) {
      findings.push({
        category: "bad_field",
        severity: "error",
        evidence: `Level-2 sobre Cena (posible ocasión): «${a.content.slice(0, 140)}»`,
        proposedRepair:
          "isOccasionMealEventType: cena conmemorativa/día del médico = tipo de evento, no SKU Cena.",
      });
      break;
    }
  }

  // stuck_funnel: re-pregunta un dato que el cliente YA dio, o el mismo slot 4+ veces.
  const asks = new Map<FunnelSlot, number>();
  const reasksAfterAnswer = new Map<FunnelSlot, number>();
  const answered = new Set<FunnelSlot>();
  for (const t of turns) {
    if (!t.content?.trim()) continue;
    if (isClient(t)) {
      for (const slot of ["correo", "invitados", "fecha"] as const) {
        if (clientAnsweredSlot(slot, t.content)) answered.add(slot);
      }
      continue;
    }
    if (!isOutgoing(t)) continue;
    const m = t.content.match(FUNNEL_Q_RE)?.[0];
    if (!m || !/\?/.test(t.content)) continue;
    const slot = funnelSlotOf(m);
    asks.set(slot, (asks.get(slot) ?? 0) + 1);
    if (answered.has(slot)) reasksAfterAnswer.set(slot, (reasksAfterAnswer.get(slot) ?? 0) + 1);
  }
  const reasked = [...reasksAfterAnswer.entries()][0];
  const tooMany = [...asks.entries()].find(([, n]) => n >= 4);
  if (reasked) {
    findings.push({
      category: "stuck_funnel",
      severity: "warn",
      evidence: `Lucy volvió a pedir «${reasked[0]}» después de que el cliente ya lo dio.`,
      proposedRepair:
        "Marcar campo satisfecho con lo que dio el cliente; no repreguntar el mismo slot.",
    });
  } else if (tooMany) {
    findings.push({
      category: "stuck_funnel",
      severity: "warn",
      evidence: `Pregunta de embudo «${tooMany[0]}» repetida varias veces.`,
      proposedRepair:
        "Si el cliente no responde ese dato, cambiar de pregunta o dejarlo pendiente.",
    });
  }

  // A16309: bucle post-cierre aquí/correo ↔ “algo más”
  const canalAsks = assistants.filter((a) =>
    /preferes\s+esperar\s+el\s+correo|confirmen?\s+por\s+aqu[ií].{0,80}correo|escriba\s+por\s+aqu[ií].{0,80}correo/i.test(
      a.content
    )
  ).length;
  const algoMasAsks = assistants.filter((a) =>
    /hay\s+algo\s+m[aá]s\s+que\s+quieras\s+sumar|te\s+urge\s+que\s+el\s+equipo/i.test(a.content)
  ).length;
  if (canalAsks >= 2 && algoMasAsks >= 2) {
    findings.push({
      category: "stuck_funnel",
      severity: "error",
      evidence: `Bucle post-cierre: canal aquí/correo ×${canalAsks} y “algo más/urge” ×${algoMasAsks}.`,
      proposedRepair:
        "A16309: tras elegir correo/aquí no re-preguntar canal; soft-exit con chat abierto.",
    });
  }

  // A16309: anotar literal “menú típico…” en vez de ofrecer opciones
  for (const a of assistants) {
    if (
      /anoto\s+alg[uú]n\s+otro\s+men[uú]|anoto\s+.{0,40}men[uú]\s+t[ií]pic/i.test(a.content)
    ) {
      findings.push({
        category: "bad_field",
        severity: "error",
        evidence: `Lucy anotó menú típico como literal: «${a.content.slice(0, 140)}»`,
        proposedRepair:
          "clientAsksAlternativeMenus → ofrecer Banquete Formal/Taquiza, no anotar el texto.",
      });
      break;
    }
  }

  // Señal para Flash: pocos hallazgos pero conversación larga
  void users;

  return findings;
}

/**
 * Heurísticas sobre campos del panel Kommo (lo que Lucy guardó).
 * Detecta bugs que no se ven solo en el chat (tipo=SKU, duración como tipo, etc.).
 */
export function runCrmFieldHeuristics(crm: CrmFieldSnapshot): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];
  const tipo = (crm.tipo_evento ?? "").trim();
  const req = (crm.requerimientos ?? "").trim();
  const fecha = (crm.fecha_evento ?? "").trim();
  const horario = (crm.horario_evento ?? "").trim();
  const invitados = (crm.num_invitados ?? "").trim();
  const presupuesto = (crm.presupuesto ?? "").trim();

  if (tipo) {
    // Duración / detalle operativo guardado como tipo (ej. "Un evento de 6 días")
    if (
      /\b\d+\s*d[ií]as?\b/i.test(tipo) ||
      /\b\d+\s*horas?\b/i.test(tipo) ||
      /^un evento\b/i.test(tipo)
    ) {
      findings.push({
        category: "bad_field",
        severity: "error",
        evidence: `CRM Tipo de evento parece duración/detalle, no tipo: «${tipo.slice(0, 120)}»`,
        proposedRepair:
          "No mapear duración («6 días») a tipo_evento; tipo = boda/XV/corporativo/etc.",
      });
    }
    // Servicio/SKU como tipo (carpas, iluminación, banquete…)
    if (
      /^(carpas?|iluminaci[oó]n|banquete|barra|meseros?|dj|sonido|entelado|pista)\b/i.test(
        tipo
      ) ||
      (req && tipo.toLowerCase() === req.toLowerCase())
    ) {
      findings.push({
        category: "bad_field",
        severity: "error",
        evidence: `CRM Tipo de evento parece servicio/SKU: «${tipo.slice(0, 120)}»`,
        proposedRepair:
          "Servicios van en Requerimientos; Tipo de evento es ocasión (boda, XV, etc.).",
      });
    }
  }

  if (fecha && /\b\d{1,2}\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?|hrs?|horas?)\b/i.test(fecha)) {
    findings.push({
      category: "bad_field",
      severity: "warn",
      evidence: `CRM Fecha parece horario: «${fecha.slice(0, 80)}»`,
      proposedRepair: "Separar fecha_evento vs horario_evento.",
    });
  }

  // A16309: año absurdo (2207) o tipografía
  if (fecha && /\b(1[6-9]\d{2}|2[1-9]\d{2}|[3-9]\d{3})\b/.test(fecha)) {
    const y = Number(fecha.match(/\b(\d{4})\b/)?.[1] ?? 0);
    const nowY = new Date().getFullYear();
    if (y && (y > nowY + 12 || y < 1990)) {
      findings.push({
        category: "bad_field",
        severity: "error",
        evidence: `CRM Fecha con año absurdo: «${fecha.slice(0, 80)}»`,
        proposedRepair: "normalizeAbsurdEventYear (2207→2027) al capturar fecha.",
      });
    }
  }

  if (horario && /^ser[ií]a\b/i.test(horario)) {
    findings.push({
      category: "bad_field",
      severity: "warn",
      evidence: `CRM Horario conserva filler «Sería…»: «${horario.slice(0, 80)}»`,
      proposedRepair: "normalizeHorarioCapture debe quitar Sería/Será antes de guardar.",
    });
  }

  if (
    horario &&
    /\b\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(
      horario
    )
  ) {
    findings.push({
      category: "bad_field",
      severity: "warn",
      evidence: `CRM Horario parece fecha: «${horario.slice(0, 80)}»`,
      proposedRepair: "No guardar la fecha en horario_evento.",
    });
  }

  if (invitados && !/^\d{1,6}$/.test(invitados.replace(/[,.\s]/g, ""))) {
    if (!/\d/.test(invitados)) {
      findings.push({
        category: "bad_field",
        severity: "warn",
        evidence: `CRM Invitados no numérico: «${invitados.slice(0, 80)}»`,
        proposedRepair: "num_invitados debe ser entero (pax).",
      });
    }
  }

  // Presupuesto $0 junto a texto "sin definir" en resumen (señal de doble campo)
  const resumen = (crm.resumen_ia ?? "").toLowerCase();
  if (
    (/^\$?0\b/.test(presupuesto) || presupuesto === "0") &&
    /sin definir|presupuesto/.test(resumen)
  ) {
    findings.push({
      category: "bad_field",
      severity: "info",
      evidence: `CRM Presupuesto «${presupuesto}» con resumen que habla de presupuesto indefinido.`,
      proposedRepair:
        "No forzar $0 si el cliente dijo sin definir; dejar vacío o texto coherente.",
    });
  }

  // Resumen IA (1048786) es campo largo (hasta 8000): truncado solo si termina en "..."
  // o si el resumen de Lucy se corta antes de su firma de cierre.
  const resumenIa = (crm.resumen_ia ?? "").trim();
  if (
    resumenIa &&
    (/\.\.\.$/.test(resumenIa) ||
      (/^RESUMEN DE CONVERSACI[OÓ]N/i.test(resumenIa) && !resumenIa.includes(RESUMEN_IA_CIERRE)))
  ) {
    findings.push({
      category: "bad_field",
      severity: "info",
      evidence: `CRM Resumen IA cortado antes de terminar (${resumenIa.length} chars): «${resumenIa.slice(-40)}»`,
      proposedRepair: "El resumen debe llegar completo hasta la firma «Actualizado por Lucy».",
    });
  }

  // Truncado típico de campos cortos cap255 (Requerimientos / Dirección).
  for (const [label, val] of [
    ["Requerimientos", req],
    ["Dirección", crm.direccion ?? ""],
  ] as const) {
    const v = val.trim();
    if (v.length >= 250 || /\.\.\.$/.test(v)) {
      findings.push({
        category: "bad_field",
        severity: "info",
        evidence: `CRM ${label} parece truncado (${v.length} chars): «${v.slice(-40)}»`,
        proposedRepair:
          "Detalle largo → Respuesta IA Largo / nota; campos cortos solo con resumen.",
      });
      break;
    }
  }

  return findings;
}

export function transcriptNeedsFlash(turns: TranscriptTurn[], heuristicCount: number): boolean {
  // Si ya hay hallazgo heurístico, no gastar Flash en ese chat.
  if (heuristicCount > 0) return false;
  const assistants = turns.filter((t) => isOutgoing(t)).length;
  // Umbral bajo: chats con Lucy (2+ replies) y algo de ida/vuelta.
  return assistants >= 2 && turns.length >= 4;
}
