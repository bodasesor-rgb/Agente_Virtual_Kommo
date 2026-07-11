import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LUCY_PROMPT_VERSION, LUCY_SERVER_VERSION } from "./lucyRelease.js";

export interface BuildMeta {
  version: string;
  lucy_prompt: string;
  built_at: string;
  built_at_display: string;
  git_commit: string | null;
  git_commit_short: string | null;
}

let cached: BuildMeta | null = null;

function formatBuiltAtDisplay(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function resolveGitCommit(): string | null {
  const raw =
    process.env.GIT_COMMIT?.trim() ||
    process.env.HOSTINGER_GIT_COMMIT?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    null;
  return raw || null;
}

function fallbackMeta(): BuildMeta {
  const builtAt = new Date().toISOString();
  const gitCommit = resolveGitCommit();
  return {
    version: LUCY_SERVER_VERSION,
    lucy_prompt: LUCY_PROMPT_VERSION,
    built_at: builtAt,
    built_at_display: formatBuiltAtDisplay(builtAt),
    git_commit: gitCommit,
    git_commit_short: gitCommit ? gitCommit.slice(0, 7) : null,
  };
}

export function getBuildMeta(): BuildMeta {
  if (cached) return cached;

  const metaPath = join(process.cwd(), "build-meta.json");
  if (existsSync(metaPath)) {
    try {
      const raw = JSON.parse(readFileSync(metaPath, "utf8")) as Partial<BuildMeta>;
      const builtAt = raw.built_at ?? new Date().toISOString();
      cached = {
        version: raw.version ?? LUCY_SERVER_VERSION,
        lucy_prompt: raw.lucy_prompt ?? LUCY_PROMPT_VERSION,
        built_at: builtAt,
        built_at_display: raw.built_at_display ?? formatBuiltAtDisplay(builtAt),
        git_commit: raw.git_commit ?? resolveGitCommit(),
        git_commit_short:
          raw.git_commit_short ??
          (raw.git_commit ? raw.git_commit.slice(0, 7) : resolveGitCommit()?.slice(0, 7) ?? null),
      };
      return cached;
    } catch {
      /* usar fallback */
    }
  }

  cached = fallbackMeta();
  return cached;
}
