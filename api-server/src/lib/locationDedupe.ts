/**
 * Duplicados de ubicación por typo / acentos / mayúsculas:
 * "Ciénaga de Flores, CIENEGA de flores" → un solo topónimo.
 */

function foldToponym(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1));
      prevDiag = tmp;
    }
  }
  return dp[b.length]!;
}

/** Mismo topónimo salvo acentos, mayúsculas o 1–2 letras de typo. */
export function looseSameToponym(a: string, b: string): boolean {
  const fa = foldToponym(a);
  const fb = foldToponym(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const len = Math.max(fa.length, fb.length);
  if (len < 6) return false;
  return editDistance(fa, fb) <= Math.max(1, Math.floor(len * 0.12));
}

/** Entre dos grafías del mismo lugar: la que trae acentos y no está en MAYÚSCULAS. */
export function preferToponymSpelling(a: string, b: string): string {
  const score = (s: string) =>
    (/[áéíóúñ]/i.test(s) ? 2 : 0) + (/[A-ZÁÉÍÓÚÑ]{4,}/.test(s) ? -1 : 0);
  return score(b) > score(a) ? b : a;
}

export function dedupeLocationParts(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return value ?? null;
  const parts = raw.split(/\s*,\s*/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const idx = out.findIndex((o) => looseSameToponym(o, p));
    if (idx >= 0) out[idx] = preferToponymSpelling(out[idx]!, p);
    else out.push(p);
  }
  return out.join(", ");
}
