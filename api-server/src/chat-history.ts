import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "../../data/chat-history.json");
const MAX_MESSAGES = 40; // 20 turns × 2 (user + assistant)

type Message = OpenAI.Chat.ChatCompletionMessageParam;
type Store = Record<string, Message[]>;

function load(): Store {
  try {
    if (existsSync(DATA_FILE)) {
      return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as Store;
    }
  } catch {
    // corrupt or missing — start fresh
  }
  return {};
}

function save(store: Store): void {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(store), "utf-8");
  } catch {
    // best-effort — don't crash the server
  }
}

let store: Store = load();

export function getHistory(chatId: string): Message[] {
  return store[chatId] ?? [];
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
