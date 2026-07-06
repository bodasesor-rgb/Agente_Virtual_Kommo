import type { ExtractedData } from "../types.js";

export interface LeadScore {
  total: number; // 0-100
  priority: "hot" | "warm" | "cold";
  factors: {
    budgetScore: number;      // 0-30 — presupuesto
    urgencyScore: number;     // 0-30 — fecha/temporalidad
    engagementScore: number;  // 0-25 — compromiso invitados + mensajes
    completenessScore: number;// 0-15 — datos completos + señales tibias
    intentScore: number;      // 0-30 — señales calientes de compra
    premiumScore: number;     // 0-15 — bonus tendencias/lujo
  };
  reasoning: string;
  shouldNotifyTeam: boolean;
}

interface ScoringContext {
  extracted: ExtractedData;
  messageCount: number;
  hasResponded: boolean;
  conversationAge: number; // en horas
  lastIntent?: string;
  conversationText?: string; // texto completo de la conversación
}

/**
 * Calcula el lead score V3.0 (0-100)
 *
 * Factores y rangos:
 *   budgetScore      0-30 — presupuesto mencionado o extraído
 *   urgencyScore     0-30 — fecha específica/mes/temporada
 *   engagementScore  0-25 — # exacto invitados > rango > aprox > mensajes
 *   completenessScore 0-15 — campos llenos + señales tibias
 *   intentScore      0-30 — señales calientes de compra (disponibilidad, reserva, anticipo…)
 *   premiumScore     0-15 — bonus: lujo, vanguardia, tendencias, estructuras colgantes
 *
 * Total potencial ≈ 145 → cap en 100.
 */
export function calculateLeadScore(context: ScoringContext): LeadScore {
  let budgetScore = 0;
  let urgencyScore = 0;
  let engagementScore = 0;
  let completenessScore = 0;
  let intentScore = 0;
  let premiumScore = 0;

  const text = (context.conversationText ?? "").toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════
  // 1. PRESUPUESTO (0-30)
  // ═══════════════════════════════════════════════════════════════════════
  if (context.extracted.presupuesto) {
    if (context.extracted.presupuesto >= 100000) budgetScore = 30;
    else if (context.extracted.presupuesto >= 50000) budgetScore = 25;
    else if (context.extracted.presupuesto >= 25000) budgetScore = 20;
    else if (context.extracted.presupuesto >= 15000) budgetScore = 15;
    else budgetScore = 10;
  } else if (text && mencionaPresupuestoTexto(text)) {
    budgetScore = 20;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. TEMPORALIDAD / URGENCIA (0-30)
  // ═══════════════════════════════════════════════════════════════════════
  if (context.extracted.fecha_horario) {
    const fechaText = context.extracted.fecha_horario.toLowerCase();
    const dateMatch = context.extracted.fecha_horario.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);

    if (dateMatch) {
      try {
        const eventDate = new Date(dateMatch[0]);
        const today = new Date();
        const daysUntilEvent = Math.floor((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilEvent < 0) urgencyScore = 0;
        else if (daysUntilEvent <= 14) urgencyScore = 30;
        else if (daysUntilEvent <= 30) urgencyScore = 27;
        else if (daysUntilEvent <= 90) urgencyScore = 25;
        else if (daysUntilEvent <= 180) urgencyScore = 20;
        else urgencyScore = 12;
      } catch {
        urgencyScore = 10;
      }
    } else if (tieneFechaEspecifica(fechaText)) {
      const meses = calcularMesesAproximados(fechaText);
      if (meses <= 3) urgencyScore = 25;
      else if (meses <= 6) urgencyScore = 20;
      else urgencyScore = 15;
    } else if (tieneMesDefinido(fechaText)) {
      urgencyScore = 15;
    } else if (tieneTemporada(fechaText)) {
      urgencyScore = 10;
    } else {
      const urgencyWords = ["urgente", "pronto", "rápido", "ya", "este fin", "esta semana", "este mes"];
      urgencyScore = urgencyWords.some(w => fechaText.includes(w)) ? 22 : 5;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. COMPROMISO — INVITADOS (0-25)
  //    Basado en qué tan comprometido está con el número de personas.
  //    Esto mide compromiso real mejor que el conteo de mensajes.
  // ═══════════════════════════════════════════════════════════════════════
  if (context.extracted.num_invitados) {
    engagementScore = 25; // número exacto extraído
  } else if (text) {
    if (tieneNumeroExacto(text)) {
      engagementScore = 25;
    } else if (tieneRangoEstrecho(text)) {
      engagementScore = 20;
    } else if (tieneRangoAmplio(text)) {
      engagementScore = 10;
    } else if (tieneAproximado(text)) {
      engagementScore = 5;
    }
  }

  // Bonus por muchos mensajes (engagement conversacional)
  if (context.messageCount >= 8) engagementScore = Math.min(engagementScore + 5, 25);
  else if (context.messageCount >= 5) engagementScore = Math.min(engagementScore + 3, 25);
  else if (context.messageCount >= 3) engagementScore = Math.min(engagementScore + 1, 25);

  // ═══════════════════════════════════════════════════════════════════════
  // 4. COMPLETITUD DE DATOS + SEÑALES TIBIAS (0-15)
  // ═══════════════════════════════════════════════════════════════════════
  const dataFields = [
    context.extracted.nombre,
    context.extracted.correo,
    context.extracted.telefono,
    context.extracted.tipo_evento,
    context.extracted.fecha_horario,
    context.extracted.num_invitados,
    context.extracted.direccion_evento,
    context.extracted.requerimientos_evento,
    context.extracted.presupuesto,
  ];
  const filledFields = dataFields.filter(f => f !== null && f !== undefined).length;
  completenessScore = Math.floor((filledFields / dataFields.length) * 10); // 0-10 por datos

  // Señales tibias suman hasta +5
  if (text) {
    let tibiasBonus = 0;
    if (preguntaPreciosGenerales(text)) tibiasBonus += 2;
    if (comparaCategorias(text)) tibiasBonus += 2;
    if (preguntaProceso(text)) tibiasBonus += 3;
    if (mencionaVenue(text)) tibiasBonus += 2;
    completenessScore = Math.min(completenessScore + tibiasBonus, 15);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. SEÑALES CALIENTES DE COMPRA (0-30)
  //    Cada señal aporta puntos. Las más fuertes dominan (no acumulan sin límite).
  // ═══════════════════════════════════════════════════════════════════════
  if (context.lastIntent === "cotizar" || context.lastIntent === "agendar") {
    intentScore = 15; // base por intención detectada por NLP
  } else if (context.lastIntent === "info") {
    intentScore = 5;
  }

  if (text) {
    // Señales máximas (+30 si aparece alguna)
    if (preguntaDisponibilidad(text)) intentScore = Math.max(intentScore, 30);
    if (preguntaComoReservar(text)) intentScore = Math.max(intentScore, 30);
    if (preguntaAnticipos(text)) intentScore = Math.max(intentScore, 25);
    if (yaDecidioServicio(text)) intentScore = Math.max(intentScore, 20);
    if (comparaOpcionesEspecificas(text)) intentScore = Math.max(intentScore, 20);

    // Penalizaciones
    if (soloCotizando(text)) intentScore = Math.max(0, intentScore - 10);
    if (sinCompromiso(text)) intentScore = Math.max(0, intentScore - 5);
  }

  // También suma si tiene correo + teléfono (alta intención de contacto)
  if (context.extracted.correo && context.extracted.telefono) {
    intentScore = Math.min(intentScore + 5, 30);
  }

  intentScore = Math.min(intentScore, 30);

  // ═══════════════════════════════════════════════════════════════════════
  // 6. BONUS PREMIUM / TENDENCIAS (0-15)
  // ═══════════════════════════════════════════════════════════════════════
  if (text) {
    if (mencionaLujoPremium(text)) premiumScore += 5;
    if (buscaModernoVanguardia(text)) premiumScore += 3;
    if (preguntaTendencias(text)) premiumScore += 3;
    if (mencionaPersonalizacion(text)) premiumScore += 2;
    if (interesaEstructurasColgantes(text)) premiumScore += 4;
    if (preguntaOpcionesPremium(text)) premiumScore += 3;
    premiumScore = Math.min(premiumScore, 15);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CÁLCULO FINAL (cap en 100)
  // ═══════════════════════════════════════════════════════════════════════
  const subtotal = budgetScore + urgencyScore + engagementScore + completenessScore + intentScore;
  const total = Math.min(subtotal + premiumScore, 100);

  let priority: "hot" | "warm" | "cold";
  if (total >= 70) priority = "hot";
  else if (total >= 40) priority = "warm";
  else priority = "cold";

  const reasons: string[] = [];
  if (budgetScore >= 20) reasons.push(`Presupuesto ${context.extracted.presupuesto ? `$${context.extracted.presupuesto.toLocaleString()}` : "definido"}`);
  if (urgencyScore >= 20) reasons.push("Fecha próxima");
  if (engagementScore >= 20) reasons.push("Invitados definidos");
  if (intentScore >= 25) reasons.push("Señal de compra caliente");
  else if (intentScore >= 15) reasons.push("Intención de compra detectada");
  if (premiumScore >= 7) reasons.push("Interés en opciones premium");
  if (completenessScore >= 10) reasons.push("Datos completos");

  const reasoning = reasons.length > 0 ? reasons.join(" | ") : "Lead en fase inicial";
  const shouldNotifyTeam = priority === "hot" || (priority === "warm" && urgencyScore >= 20 && intentScore >= 15);

  return {
    total,
    priority,
    factors: { budgetScore, urgencyScore, engagementScore, completenessScore, intentScore, premiumScore },
    reasoning,
    shouldNotifyTeam,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — TEMPORALIDAD
// ─────────────────────────────────────────────────────────────────────────────

function tieneFechaEspecifica(texto: string): boolean {
  return /\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(texto) ||
    /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{1,2}/i.test(texto) ||
    /para el \d{1,2}/i.test(texto);
}

function tieneMesDefinido(texto: string): boolean {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return meses.some(m => texto.includes(m));
}

function tieneTemporada(texto: string): boolean {
  return ["verano", "invierno", "primavera", "otoño", "navidad", "fin de año"].some(t => texto.includes(t));
}

function calcularMesesAproximados(texto: string): number {
  // Retorna estimación de meses hasta el evento
  const mesesProximos = ["junio", "julio", "agosto"];
  return mesesProximos.some(m => texto.includes(m)) ? 3 : 6;
}

function mencionaPresupuestoTexto(texto: string): boolean {
  return /tengo\s+\$?\d{1,3}(,\d{3})*/i.test(texto) ||
    /presupuesto\s+de\s+\$?\d{1,3}(,\d{3})*/i.test(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — INVITADOS (compromiso)
// ─────────────────────────────────────────────────────────────────────────────

function tieneNumeroExacto(texto: string): boolean {
  return /\d+\s*(personas|invitados|gente|asistentes)/i.test(texto) &&
    !/entre|como|aproximadamente|más o menos/i.test(texto);
}

function tieneRangoEstrecho(texto: string): boolean {
  const match = texto.match(/(\d+)\s*[-a]\s*(\d+)/);
  if (!match) return false;
  const diff = Number(match[2]) - Number(match[1]);
  return diff > 0 && diff <= 30;
}

function tieneRangoAmplio(texto: string): boolean {
  const match = texto.match(/(\d+)\s*[-a]\s*(\d+)/);
  if (!match) return false;
  const diff = Number(match[2]) - Number(match[1]);
  return diff > 30;
}

function tieneAproximado(texto: string): boolean {
  return /(como|aproximadamente|más o menos|alrededor de)\s*\d+/i.test(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — SEÑALES CALIENTES (intención de compra)
// ─────────────────────────────────────────────────────────────────────────────

function preguntaDisponibilidad(texto: string): boolean {
  return /están\s+(disponibles|libres)/i.test(texto) ||
    /tienen\s+disponibilidad/i.test(texto) ||
    /está\s+disponible/i.test(texto) ||
    /pueden\s+ese\s+día/i.test(texto);
}

function preguntaComoReservar(texto: string): boolean {
  return /cómo\s+(reservo|aparto|separo)/i.test(texto) ||
    /qué\s+sigue/i.test(texto) ||
    /siguiente\s+paso/i.test(texto) ||
    /cómo\s+es\s+el\s+proceso/i.test(texto);
}

function preguntaAnticipos(texto: string): boolean {
  return /cuánto\s+(de\s+)?anticipo/i.test(texto) ||
    /cómo\s+se\s+paga/i.test(texto) ||
    /forma\s+de\s+pago/i.test(texto) ||
    /enganche/i.test(texto);
}

function comparaOpcionesEspecificas(texto: string): boolean {
  return /cuál\s+es\s+mejor|diferencia\s+entre.*y/i.test(texto) &&
    /(pizza|sushi|parrillada|taquiza|banquete)/i.test(texto);
}

function yaDecidioServicio(texto: string): boolean {
  return /(quiero|me gusta|voy con|decidí)\s+(la|el)\s+/i.test(texto) &&
    /(pizza|sushi|parrillada|taquiza|banquete|crepas|canapés)/i.test(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — SEÑALES TIBIAS
// ─────────────────────────────────────────────────────────────────────────────

function preguntaPreciosGenerales(texto: string): boolean {
  return /(cuánto\s+sale|cuánto\s+cuesta|precios)/i.test(texto) &&
    !/(parrillada|banquete|pizza|sushi|específico)/i.test(texto);
}

function comparaCategorias(texto: string): boolean {
  return /(diferencia|mejor)\s+entre\s+(banquete|barra)/i.test(texto);
}

function preguntaProceso(texto: string): boolean {
  return /cómo\s+funciona|qué\s+incluye|cómo\s+es\s+el\s+servicio/i.test(texto);
}

function mencionaVenue(texto: string): boolean {
  return /es\s+en\s+|en\s+el\s+|lugar\s+es|venue|salón/i.test(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — SEÑALES FRÍAS (penalizaciones)
// ─────────────────────────────────────────────────────────────────────────────

function soloCotizando(texto: string): boolean {
  return /(solo|nada\s+más)\s+(estoy\s+)?(cotizando|viendo\s+precios)/i.test(texto);
}

function sinCompromiso(texto: string): boolean {
  return /todavía\s+no\s+(decido|sé|tengo)/i.test(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — SEÑALES PREMIUM / TENDENCIAS
// ─────────────────────────────────────────────────────────────────────────────

function mencionaLujoPremium(texto: string): boolean {
  return /(de\s+lujo|premium|elegante|sofisticado|exclusivo|vip)/i.test(texto);
}

function buscaModernoVanguardia(texto: string): boolean {
  return /(moderno|vanguardia|contemporáneo|diferente|innovador|trendy)/i.test(texto);
}

function preguntaTendencias(texto: string): boolean {
  return /(qué\s+está\s+de\s+moda|tendencia|qué\s+se\s+usa\s+ahora|lo\s+más\s+nuevo)/i.test(texto);
}

function mencionaPersonalizacion(texto: string): boolean {
  return /(personalizado|con\s+(nuestro|mi)\s+logo|branding|customizado)/i.test(texto);
}

function interesaEstructurasColgantes(texto: string): boolean {
  return /(techo\s+alto|decoración\s+aérea|colgante|wisteria|estructura)/i.test(texto);
}

function preguntaOpcionesPremium(texto: string): boolean {
  return /(parrillada\s+argentina|mixología\s+premium|sushi\s+premium|mesas\s+de\s+mármol)/i.test(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES AUXILIARES EXPORTADAS
// ─────────────────────────────────────────────────────────────────────────────

/** Detecta si hay señales de urgencia en el mensaje */
export function detectUrgency(text: string): { isUrgent: boolean; reason: string | null } {
  const urgencyPatterns = [
    { pattern: /urgen(te|cia)/i, reason: "Palabra 'urgente' detectada" },
    { pattern: /(este|el próximo) (fin de semana|sábado|domingo)/i, reason: "Evento este fin de semana" },
    { pattern: /en (1|2|3|una|dos|tres) (semana|día)/i, reason: "Plazo muy corto mencionado" },
    { pattern: /(ya|rápido|pronto|inmediato)/i, reason: "Palabras de urgencia" },
    { pattern: /necesito (para|el|este)/i, reason: "Necesidad inmediata" },
  ];

  for (const { pattern, reason } of urgencyPatterns) {
    if (pattern.test(text)) return { isUrgent: true, reason };
  }
  return { isUrgent: false, reason: null };
}

/** Clasifica la etapa del embudo en la que está el lead */
export function detectStage(context: ScoringContext): string {
  const { extracted, messageCount } = context;

  if (extracted.nombre && extracted.correo && extracted.fecha_horario && extracted.presupuesto) {
    return "closing";
  }
  if (extracted.presupuesto && extracted.fecha_horario) {
    return "negotiation";
  }
  if (extracted.tipo_evento && extracted.num_invitados) {
    return "qualification";
  }
  if (extracted.tipo_evento || messageCount >= 3) {
    return "proposal";
  }
  return "discovery";
}
