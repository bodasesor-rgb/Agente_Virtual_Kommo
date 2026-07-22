/**
 * Extrae texto plano de un PDF (Buffer o base64).
 * Usa unpdf (pdf.js) — sin dependencias nativas, apto para el bundle Hostinger.
 */

function stripPdfNoise(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPlainTextFromPdf(input: {
  buffer?: Buffer;
  base64?: string;
}): Promise<{ text: string; pages: number }> {
  let bytes: Uint8Array;
  if (input.buffer && input.buffer.length) {
    bytes = new Uint8Array(input.buffer);
  } else if (input.base64?.trim()) {
    const raw = input.base64.trim().replace(/^data:application\/pdf;base64,/i, "");
    bytes = new Uint8Array(Buffer.from(raw, "base64"));
  } else {
    throw new Error("pdf_required");
  }

  if (bytes.length < 32) throw new Error("pdf_too_small");
  if (bytes.length > 12 * 1024 * 1024) throw new Error("pdf_too_large");

  const head = Buffer.from(bytes.slice(0, 5)).toString("ascii");
  if (!head.startsWith("%PDF")) throw new Error("not_a_pdf");

  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  const text = stripPdfNoise(
    typeof result.text === "string" ? result.text : Array.isArray(result.text) ? result.text.join("\n") : "",
  );
  const pages = typeof result.totalPages === "number" ? result.totalPages : 0;

  if (!text) throw new Error("pdf_empty_text");
  return { text, pages };
}
