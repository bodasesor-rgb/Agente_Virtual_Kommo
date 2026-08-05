/**
 * Redimensiona/comprime imágenes antes de Vision (Gemini).
 * Máx 1024×1024, JPEG ~80% — reduce tokens de imagen y egress.
 * Pure JS (jimp); no usa sharp nativo (Hostinger).
 */
import { Jimp, JimpMime } from "jimp";

export const VISION_MAX_EDGE = 1024;
export const VISION_JPEG_QUALITY = 80;

export type CompressedImage = {
  base64: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  bytesIn: number;
  bytesOut: number;
  resized: boolean;
};

const compressStats = {
  total: 0,
  resized: 0,
  bytesIn: 0,
  bytesOut: 0,
  errors: 0,
};

export function getImageCompressStats(): typeof compressStats {
  return { ...compressStats };
}

export function resetImageCompressStatsForTests(): void {
  compressStats.total = 0;
  compressStats.resized = 0;
  compressStats.bytesIn = 0;
  compressStats.bytesOut = 0;
  compressStats.errors = 0;
}

/**
 * Escala para que el lado mayor ≤ maxEdge y re-encodea JPEG quality.
 * Si falla el decode, lanza (caller puede enviar original).
 */
export async function compressImageForVision(
  input: Buffer | ArrayBuffer | Uint8Array,
  opts?: { maxEdge?: number; quality?: number }
): Promise<CompressedImage> {
  const maxEdge = opts?.maxEdge ?? VISION_MAX_EDGE;
  const quality = opts?.quality ?? VISION_JPEG_QUALITY;
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  const bytesIn = buf.byteLength;

  const img = await Jimp.read(buf);
  const beforeW = img.width;
  const beforeH = img.height;
  let resized = false;
  if (beforeW > maxEdge || beforeH > maxEdge) {
    img.scaleToFit({ w: maxEdge, h: maxEdge });
    resized = true;
  }

  const out = await img.getBuffer(JimpMime.jpeg, { quality });
  const result: CompressedImage = {
    base64: out.toString("base64"),
    mimeType: "image/jpeg",
    width: img.width,
    height: img.height,
    bytesIn,
    bytesOut: out.byteLength,
    resized: resized || out.byteLength < bytesIn,
  };

  compressStats.total += 1;
  if (result.resized) compressStats.resized += 1;
  compressStats.bytesIn += bytesIn;
  compressStats.bytesOut += out.byteLength;
  return result;
}

/** Intenta comprimir; si falla, null (caller usa original). */
export async function tryCompressImageForVision(
  input: Buffer | ArrayBuffer | Uint8Array,
  opts?: { maxEdge?: number; quality?: number }
): Promise<CompressedImage | null> {
  try {
    return await compressImageForVision(input, opts);
  } catch {
    compressStats.errors += 1;
    return null;
  }
}
