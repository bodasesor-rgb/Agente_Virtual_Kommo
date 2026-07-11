import type { Request } from "express";

const DEFAULT_PUBLIC_BASE = "https://midnightblue-mosquito-424375.hostingersite.com";

/** URL pública HTTPS para llamadas server→server (auto-cliente, cron). */
export function resolveLucyPublicBase(req?: Request): string {
  const fromEnv = process.env.LUCY_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (req) {
    const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0]?.trim();
    if (host) {
      let proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0]?.trim();
      if (/hostingersite\.com|bodasesor/i.test(host)) proto = "https";
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }

  return DEFAULT_PUBLIC_BASE;
}
