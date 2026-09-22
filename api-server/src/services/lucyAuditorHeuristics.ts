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

  // repeat_reply
  for (let i = 1; i < assistants.length; i++) {
    if (similar(assistants[i - 1]!.content, assistants[i]!.content)) {
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

  // stuck_funnel: misma pregunta embudo 3+
  const funnelAsks = assistants
    .map((a) => a.content.match(FUNNEL_Q_RE)?.[0]?.toLowerCase())
    .filter(Boolean) as string[];
  const counts = new Map<string, number>();
  for (const q of funnelAsks) counts.set(q, (counts.get(q) ?? 0) + 1);
  for (const [q, n] of counts) {
    if (n >= 3) {
      findings.push({
        category: "stuck_funnel",
        severity: "warn",
        evidence: `Pregunta de embudo «${q}» repetida ${n} veces.`,
        proposedRepair:
          "Marcar campo satisfecho o cambiar de pregunta; no repreguntar el mismo slot.",
      });
      break;
    }
  }

  // Señal para Flash: pocos hallazgos pero conversación larga
  void users;

  return findings;
}

export function transcriptNeedsFlash(turns: TranscriptTurn[], heuristicCount: number): boolean {
  // Si ya hay hallazgo heurístico, no gastar Flash en ese chat.
  if (heuristicCount > 0) return false;
  const assistants = turns.filter((t) => isOutgoing(t)).length;
  // Umbral bajo: chats con Lucy (2+ replies) y algo de ida/vuelta.
  return assistants >= 2 && turns.length >= 4;
}
