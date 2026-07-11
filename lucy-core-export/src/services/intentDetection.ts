export type Intent = "cotizar" | "info" | "agendar" | "objecion" | "despedida" | "saludo" | "otro";
export type Sentiment = "positivo" | "neutral" | "negativo";

export interface IntentResult {
  intent: Intent;
  confidence: number; // 0-1
  entities: {
    eventType?: string;
    date?: string;
    budget?: number;
    location?: string;
  };
}

export interface SentimentResult {
  sentiment: Sentiment;
  score: number; // -1 a 1
  confidence: number;
}

/**
 * Detecta la intención principal del mensaje del usuario
 */
export function detectIntent(text: string): IntentResult {
  const lower = text.toLowerCase();

  const cotizarPatterns = [
    /cu[áa]nto (cuesta|costar[íi]a|sale)/,
    /precio/,
    /cotiza(ción|r)/,
    /presupuesto/,
    /costo/,
    /cuanto me cobran/,
    /cuanto sale/,
  ];

  const agendarPatterns = [
    /agendar/,
    /cita/,
    /reuni[óo]n/,
    /visita/,
    /cuando pueden/,
    /disponibilidad/,
    /ver el sal[óo]n/,
    /conocer el lugar/,
  ];

  const objecionPatterns = [
    /muy caro/,
    /no (estoy segur|s[ée])/,
    /necesito pensar/,
    /d[ée]jame ver/,
    /tengo que consultar/,
    /no tengo presupuesto/,
  ];

  const despedidaPatterns = [
    /gracias.*adi[óo]s/,
    /nos vemos/,
    /hasta luego/,
    /fue todo/,
    /es todo/,
    /gracias.*info/,
  ];

  const saludoPatterns = [
    /^(hola|buenos|buenas|buen)/,
    /qu[ée] tal/,
    /c[óo]mo est[áa]/,
  ];

  const infoPatterns = [
    /qu[ée] (servicios|opciones|paquetes)/,
    /(d[íi]game|cu[ée]ntame|platique) (sobre|de|m[áa]s)/,
    /qu[ée] incluye/,
    /qu[ée] ofrecen/,
    /tienen.*disponible/,
  ];

  if (cotizarPatterns.some(p => p.test(lower))) {
    return { intent: "cotizar", confidence: 0.9, entities: extractEntities(text) };
  }
  if (agendarPatterns.some(p => p.test(lower))) {
    return { intent: "agendar", confidence: 0.85, entities: extractEntities(text) };
  }
  if (objecionPatterns.some(p => p.test(lower))) {
    return { intent: "objecion", confidence: 0.8, entities: extractEntities(text) };
  }
  if (despedidaPatterns.some(p => p.test(lower))) {
    return { intent: "despedida", confidence: 0.9, entities: {} };
  }
  if (saludoPatterns.some(p => p.test(lower))) {
    return { intent: "saludo", confidence: 0.95, entities: {} };
  }
  if (infoPatterns.some(p => p.test(lower))) {
    return { intent: "info", confidence: 0.7, entities: extractEntities(text) };
  }

  return { intent: "otro", confidence: 0.5, entities: extractEntities(text) };
}

/**
 * Analiza el sentimiento del mensaje
 */
export function analyzeSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();

  const positiveWords = [
    "excelente", "perfecto", "genial", "me encanta", "súper", "increíble",
    "maravilloso", "hermoso", "ideal", "justo lo que", "exactamente",
    "me gusta", "interesante", "bien", "bueno", "gracias",
  ];
  const negativeWords = [
    "caro", "no puedo", "no tengo", "malo", "difícil", "complicado",
    "no me gusta", "no sirve", "decepcion", "molesto", "problema",
    "no funciona", "tarde", "lento", "mal", "no estoy segur",
  ];
  const veryNegativeWords = [
    "horrible", "pésimo", "terrible", "desastre", "fraude", "estafa",
  ];

  let positiveCount = 0;
  let negativeCount = 0;
  let veryNegativeCount = 0;

  for (const word of positiveWords) {
    if (lower.includes(word)) positiveCount++;
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) negativeCount++;
  }
  for (const word of veryNegativeWords) {
    if (lower.includes(word)) veryNegativeCount++;
  }

  const score = (positiveCount * 0.3) - (negativeCount * 0.3) - (veryNegativeCount * 0.5);
  const normalizedScore = Math.max(-1, Math.min(1, score));

  let sentiment: Sentiment;
  let confidence: number;

  if (normalizedScore > 0.2) {
    sentiment = "positivo";
    confidence = Math.min(0.9, 0.5 + positiveCount * 0.1);
  } else if (normalizedScore < -0.2) {
    sentiment = "negativo";
    confidence = Math.min(0.9, 0.5 + (negativeCount + veryNegativeCount) * 0.1);
  } else {
    sentiment = "neutral";
    confidence = 0.7;
  }

  return { sentiment, score: normalizedScore, confidence };
}

/**
 * Extrae entidades del texto (fechas, números, ubicaciones, etc.)
 */
function extractEntities(text: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};

  const eventTypes = [
    { pattern: /boda/i, type: "boda" },
    { pattern: /xv a[ñn]os/i, type: "XV años" },
    { pattern: /cumplea[ñn]os/i, type: "cumpleaños" },
    { pattern: /bautizo/i, type: "bautizo" },
    { pattern: /primera comuni[óo]n/i, type: "primera comunión" },
    { pattern: /corporativo/i, type: "corporativo" },
    { pattern: /conferencia/i, type: "conferencia" },
  ];

  for (const { pattern, type } of eventTypes) {
    if (pattern.test(text)) {
      entities.eventType = type;
      break;
    }
  }

  const datePattern = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/;
  const dateMatch = text.match(datePattern);
  if (dateMatch) {
    entities.date = dateMatch[0];
  }

  const numberPattern = /\b(\d{3,})\b/g;
  const numbers = text.match(numberPattern);
  if (numbers) {
    const parsedNumbers = numbers.map(n => parseInt(n, 10));
    if (parsedNumbers.length > 0) {
      const max = Math.max(...parsedNumbers);
      if (max > 1000) entities.budget = max;
    }
  }

  const cities = [
    "cdmx", "ciudad de méxico", "guadalajara", "monterrey", "puebla",
    "querétaro", "cancún", "mérida", "toluca", "león", "tijuana",
  ];
  for (const city of cities) {
    if (text.toLowerCase().includes(city)) {
      entities.location = city;
      break;
    }
  }

  return entities;
}

/**
 * Detecta si el mensaje contiene una objeción y de qué tipo
 */
export interface ObjectionDetection {
  hasObjection: boolean;
  type?: "precio" | "tiempo" | "duda" | "comparacion";
  text?: string;
}

export function detectObjection(text: string): ObjectionDetection {
  const lower = text.toLowerCase();

  if (/muy caro|muy costoso|no tengo (tanto )?presupuesto|fuera de mi presupuesto/i.test(lower)) {
    return { hasObjection: true, type: "precio", text: "Cliente encuentra el precio alto" };
  }
  if (/necesito pensar|déjame consultar|tengo que hablar con|déjame ver/i.test(lower)) {
    return { hasObjection: true, type: "tiempo", text: "Cliente necesita tiempo para decidir" };
  }
  if (/no (estoy segur|sé si)|tengo dudas|no me convence/i.test(lower)) {
    return { hasObjection: true, type: "duda", text: "Cliente tiene dudas sobre el servicio" };
  }
  if (/otro lugar|otras opciones|voy a comparar|he visto otros/i.test(lower)) {
    return { hasObjection: true, type: "comparacion", text: "Cliente está comparando opciones" };
  }

  return { hasObjection: false };
}
