/**
 * Errores que ya se repararon en Lucy → el supervisor (Gemini) los vigila en cada auditoría.
 * - MANUAL_LESSONS: arreglos hechos a mano (agregar uno por cada reparación nueva).
 * - Arreglos de Cursor publicados: se leen solos de repair-runs.json.
 * Sin datos de clientes: solo la descripción general del error y de lo correcto.
 */
import { existsSync, readFileSync } from "node:fs";
import { getLucyRepairRunsPath } from "../lib/lucyDataPaths.js";
import type { RepairJob } from "./cursorRepairAgent.js";

export interface SupervisorLesson {
  /** Lead o trabajo donde se vio (referencia interna). */
  ref: string;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  /** Qué hizo mal Lucy (general). */
  wrong: string;
  /** Qué debe hacer ahora. */
  right: string;
  source: "manual" | "cursor";
}

type ManualLesson = Omit<SupervisorLesson, "source">;

export const MANUAL_LESSONS: ManualLesson[] = [
  {
    ref: "A16614",
    date: "2026-10-03",
    category: "misunderstood",
    wrong: "El cliente pidió «paquete todo incluido, desde el lugar» y Lucy repitió el menú de servicios / «¿Qué te gustaría revisar primero?»",
    right: "Confirmar que el equipo arma paquete todo incluido con lugar y preguntar la zona (luego presupuesto)",
  },
  {
    ref: "A16612",
    date: "2026-10-03",
    category: "misunderstood",
    wrong: "Ante una promo pegada a mitad de chat, Lucy desaconsejó el banquete («no es lo más práctico»), habló de «la junta» sin serlo y re-preguntó invitados ya dados",
    right: "Acusar el código de promo, explicar el mínimo de personas sin desaconsejar servicios y conservar invitados/fecha/horario ya dados",
  },
  {
    ref: "A16612",
    date: "2026-10-03",
    category: "tone",
    wrong: "Lucy inventó un estilo («para un vibe mexicana») porque el evento es en Estado de México, y usó la palabra «vibe»",
    right: "No suponer estilos que el cliente no pidió; decir «estilo» o «ambiente», nunca «vibe»",
  },
  {
    ref: "A16612",
    date: "2026-10-03",
    category: "misunderstood",
    wrong: "El cliente dijo «Me encanta esta idea» (reacción) y Lucy le soltó ideas/tips de decoración no pedidos",
    right: "Una reacción positiva no es pedido de ideas: seguir con lo que se estaba platicando",
  },
  {
    ref: "A16610",
    date: "2026-10-03",
    category: "tone",
    wrong: "Elogios forzados al saber el tipo de evento: «¡Qué buen plan!», «suena increíble», «¡Qué padre!»",
    right: "Acuse cordial y profesional: «Perfecto, con gusto te ayudamos con el aniversario de tu empresa»",
  },
  {
    ref: "A16583",
    date: "2026-10-02",
    category: "bad_field",
    wrong: "Tomó «de noche» como dirección, «Necesitaba Moviliario» como nombre, y una foto sin texto como pregunta de servicio/ideas",
    right: "Solo anotar dirección/nombre reales; una foto sin texto no es una pregunta",
  },
  {
    ref: "A16567",
    date: "2026-10-01",
    category: "tone",
    wrong: "Mandó catálogo desordenado, dijo «no lo tengo listado» al dar ideas y cambió el nombre del asesor por «nuestro equipo»",
    right: "Catálogo ordenado, ideas sin avisos de inventario y respetar el nombre del asesor",
  },
  {
    ref: "A16555",
    date: "2026-10-01",
    category: "asked_known_data",
    wrong: "En una compra de mobiliario preguntó tipo de evento, fecha, horario e invitados",
    right: "En compra/venta pedir piezas, ciudad de entrega, correo y presupuesto; no datos de evento",
  },
  {
    ref: "A16550",
    date: "2026-10-01",
    category: "ignored_question",
    wrong: "Ofreció «¿te comparto los niveles?», el cliente dijo «sí, adelante» y Lucy no los mandó; y siguió usando un nombre que el cliente corrigió",
    right: "Cumplir lo ofrecido cuando el cliente acepta; usar siempre el nombre corregido",
  },
  {
    ref: "A16531",
    date: "2026-10-01",
    category: "wrong_info",
    wrong: "Volcó PDF/precios que el cliente no pidió y usó la ficha de banquete Formal para Kosher",
    right: "Precios solo si los pide; cada servicio con su propia ficha",
  },
  {
    ref: "A16523",
    date: "2026-09-30",
    category: "bad_field",
    wrong: "Tomó «7 personas por mesa» como invitados, «no» suelto como presupuesto, y puso «salas» en plural cuando era una",
    right: "Invitados solo del total de personas; respetar cantidades exactas",
  },
  {
    ref: "A16512",
    date: "2026-09-30",
    category: "bad_field",
    wrong: "«Es pista / no carpa» borró la pista; fecha y horario juntos perdieron la fecha; repitió medidas ya dadas",
    right: "Una negación quita solo lo negado; conservar fecha y horario; no repetir datos dados",
  },
  {
    ref: "A16511",
    date: "2026-09-30",
    category: "asked_known_data",
    wrong: "Pidió correo aunque el cliente eligió seguir por WhatsApp",
    right: "Si eligió WhatsApp/chat, no pedir correo",
  },
  {
    ref: "A16484",
    date: "2026-09-29",
    category: "misunderstood",
    wrong: "No entendió negaciones («no quiero», «ya lo tengo», «para complementar con») y ofreció ideas no pedidas",
    right: "Respetar lo que el cliente descarta o ya tiene",
  },
  {
    ref: "A16477",
    date: "2026-09-29",
    category: "repeat_reply",
    wrong: "Respondió doble, insistió con «¿algo más?» repetido y volvió a pedir correo tras un «No»",
    right: "Una respuesta por turno; no repetir «algo más»; un «No» al correo se respeta",
  },
  {
    ref: "A16445",
    date: "2026-09-28",
    category: "misunderstood",
    wrong: "Con «venta o renta» no aclaró el enfoque y tomó la frase como nombre",
    right: "Decir que nos enfocamos en renta y también cotizamos venta",
  },
  {
    ref: "A16438",
    date: "2026-09-28",
    category: "misunderstood",
    wrong: "Agregó animación/hora loca cuando el cliente pidió solo un show con nombre",
    right: "Cotizar solo el show pedido; «no quiero animación» se respeta",
  },
  {
    ref: "A16345",
    date: "2026-09-24",
    category: "stuck_funnel",
    wrong: "Tras el cierre quedó en bucle: canal aquí/correo ↔ «¿algo más?» ↔ urgencia",
    right: "Tras elegir canal, salida suave con el chat abierto; no repetir preguntas de cierre",
  },
  {
    ref: "A16263",
    date: "2026-09-22",
    category: "bad_field",
    wrong: "Trató «cena conmemorativa» como el producto Cena y cerró «ya tengo todo» cuando el cliente pidió precio",
    right: "Cena de ocasión = tipo de evento; si pide precio, contestar antes de cerrar",
  },
  {
    ref: "A16244",
    date: "2026-09-21",
    category: "premature_close",
    wrong: "Dejó el chat muerto con un acuse sin pregunta («Queda anotado lo de Banquete.»)",
    right: "Cada mensaje termina con una pregunta que mantiene la conversación",
  },
];

const MAX_LESSONS = 30;
const MAX_BLOCK_CHARS = 4500;

function noQuotes(s: string): string {
  return s
    .replace(/(?:Cliente|Lucy):\s*«[^»]*»?/gi, "")
    .replace(/«[^»]*»?/g, "«…»")
    .replace(/\s*→\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Misma normalización que repairSignature (lucyRepairStore), sin importar la BD. */
function sigLike(label: string): string {
  return label
    .toLowerCase()
    .replace(/«[^»]*»?/g, "«…»")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function readJobs(): RepairJob[] {
  const path = getLucyRepairRunsPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { jobs?: RepairJob[] };
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    return [];
  }
}

/** Arreglos de Cursor ya publicados → lecciones (uno por problema arreglado). */
export function lessonsFromRepairJobs(jobs: RepairJob[]): SupervisorLesson[] {
  const out: SupervisorLesson[] = [];
  for (const job of jobs) {
    if (job.status !== "published") continue;
    const date = (job.publishedAt ?? job.finishedAt ?? job.updatedAt ?? "").slice(0, 10);
    for (const item of job.outcome?.fixed ?? []) {
      const sig = item.ids.map((id) => job.repairSigs?.[id]).find(Boolean);
      const category = sig?.split(":")[0] ?? job.problems[0]?.category ?? "other";
      const sigText = sig ? sig.slice(category.length + 1, category.length + 41) : "";
      const problem =
        job.problems.find((p) => p.category === category && sigText && sigLike(p.label).startsWith(sigText)) ??
        job.problems.find((p) => p.category === category);
      const wrong = noQuotes(problem?.label ?? "");
      const right = noQuotes(item.text).slice(0, 220);
      if (!wrong || !right) continue;
      out.push({ ref: `Cursor ${job.id.slice(0, 8)}`, date, category, wrong: wrong.slice(0, 200), right, source: "cursor" });
    }
  }
  return out;
}

export function listSupervisorLessons(jobs: RepairJob[] = readJobs()): SupervisorLesson[] {
  const all: SupervisorLesson[] = [
    ...MANUAL_LESSONS.map((l) => ({ ...l, source: "manual" as const })),
    ...lessonsFromRepairJobs(jobs),
  ];
  const seen = new Set<string>();
  return all
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((l) => {
      const key = `${l.category}|${l.wrong.toLowerCase().slice(0, 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Bloque para el prompt de Gemini: lo más reciente primero, con tope de tamaño (costo). */
export function buildSupervisorLessonsBlock(lessons: SupervisorLesson[] = listSupervisorLessons()): string {
  if (!lessons.length) return "";
  const lines: string[] = [];
  let size = 0;
  for (const l of lessons.slice(0, MAX_LESSONS)) {
    const line = `- (${l.category}) MAL: ${l.wrong} → BIEN: ${l.right}`;
    if (size + line.length > MAX_BLOCK_CHARS) break;
    lines.push(line);
    size += line.length;
  }
  return [
    "ERRORES QUE YA SE REPARARON (Lucy ya no debería cometerlos; si vuelves a ver uno, repórtalo SIEMPRE con esa categoría):",
    ...lines,
  ].join("\n");
}
