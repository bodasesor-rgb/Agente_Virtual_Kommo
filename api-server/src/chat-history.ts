import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveHistoryFile(): string {
  const fromEnv = process.env["LUCY_CHAT_HISTORY_PATH"]?.trim();
  if (fromEnv) return fromEnv;
  // Prefer sibling lucy-data (Hostinger: fuera de deploy/). Fallback legacy.
  const sibling = join(process.cwd(), "..", "lucy-data", "chat-history.json");
  const legacy = join(__dirname, "../../data/chat-history.json");
  return sibling || legacy;
}

const MAX_MESSAGES = 40; // 20 turns × 2 (user + assistant)

type Message = OpenAI.Chat.ChatCompletionMessageParam;
type Store = Record<string, Message[]>;

function load(): Store {
  try {
    const file = resolveHistoryFile();
    // Migrar legacy → ruta persistente si aplica
    const legacy = join(__dirname, "../../data/chat-history.json");
    if (!existsSync(file) && existsSync(legacy) && file !== legacy) {
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, readFileSync(legacy, "utf-8"));
      } catch {
        /* best-effort */
      }
    }
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf-8")) as Store;
    }
  } catch {
    // corrupt or missing — start fresh
  }
  return {};
}

function save(store: Store): void {
  try {
    const file = resolveHistoryFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(store), "utf-8");
  } catch {
    // best-effort — don't crash the server
  }
}

let store: Store = load();

export function getHistory(chatId: string): Message[] {
  return store[chatId] ?? [];
}

/** Todas las claves de historial (leadId / chatId). */
export function listHistoryKeys(): string[] {
  return Object.keys(store);
}

export function clearHistory(chatId: string): void {
  delete store[chatId];
  save(store);
}

export function appendHistory(
  chatId: string,
  userText: string,
  assistantText: string
): void {
  const history = store[chatId] ?? [];
  history.push({ role: "user", content: userText });
  history.push({ role: "assistant", content: assistantText });
  if (history.length > MAX_MESSAGES) {
    history.splice(0, history.length - MAX_MESSAGES);
  }
  store[chatId] = history;
  save(store);
}
