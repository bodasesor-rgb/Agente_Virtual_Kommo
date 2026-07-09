import type { ExtractedData } from "../types.js";
import type { IntentResult, SentimentResult } from "./intentDetection.js";

export interface ExecutiveSummaryInput {
  extracted: ExtractedData;
  crmMergedLines: string[];
  leadScore: {
    total: number;
    priority: string;
    reasoning: string;
  };
  intent: IntentResult;
  sentiment: SentimentResult;
  hasObjection: boolean;
  objectionType?: string | null;
}

function fromLines(mergedLines: string[], labelPattern: RegExp): string | null {
  const line = mergedLines.find((l) => labelPattern.test(l));
  if (!line) return null;
  return line.replace(/^- /, "").split(":").slice(1).join(":").trim() || null;
}

/** Nota interna enriquecida para Alejandro al calificar o detectar lead caliente. */
export function buildExecutiveSummaryNota(input: ExecutiveSummaryInput): string {
  const { extracted, crmMergedLines, leadScore, intent, sentiment } = input;

  const nombre = extracted.nombre ?? fromLines(crmMergedLines, /Nombre del cliente/i);
  const evento = extracted.tipo_evento ?? fromLines(crmMergedLines, /Tipo de evento/i);
  const fecha = extracted.fecha_horario ?? fromLines(crmMergedLines, /Fecha y horario/i);
  const invitados = extracted.num_invitados ?? fromLines(crmMergedLines, /Número de invitados/i);
  const ubicacion = extracted.direccion_evento ?? fromLines(crmMergedLines, /Lugar\/dirección/i);
  const ppto = extracted.presupuesto ?? fromLines(crmMergedLines, /Presupuesto/i);
  const reqs = extracted.requerimientos_evento ?? fromLines(crmMergedLines, /Requerimientos/i);
  const correo = extracted.correo ?? fromLines(crmMergedLines, /Correo electrónico/i);

  const lines = [
    "📊 RESUMEN EJECUTIVO — Lucy",
    "",
    `Prioridad: ${leadScore.priority.toUpperCase()} (score ${leadScore.total}/100)`,
    `Intención: ${intent.intent} | Sentimiento: ${sentiment.sentiment}`,
    leadScore.reasoning ? `Análisis: ${leadScore.reasoning}` : null,
    input.hasObjection
      ? `⚠️ Objeción detectada${input.objectionType ? `: ${input.objectionType}` : ""}`
      : null,
    "",
    "📋 Datos del evento:",
    nombre ? `• Cliente: ${nombre}` : null,
    correo ? `• Correo: ${correo}` : null,
    evento ? `• Evento: ${evento}` : null,
    fecha ? `• Fecha: ${fecha}` : null,
    invitados ? `• Invitados: ${invitados}` : null,
    ubicacion ? `• Lugar: ${ubicacion}` : null,
    ppto ? `• Presupuesto: $${ppto} MXN` : null,
    reqs ? `• Servicios: ${reqs}` : null,
    "",
    "✅ Acción sugerida: revisar chat y preparar cotización.",
  ];

  return lines.filter((l) => l != null).join("\n");
}
