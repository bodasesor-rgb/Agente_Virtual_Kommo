import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export interface TrainingExample {
  id: string;
  userMessage: string;
  lucyResponse: string;
  label?: string;
  createdAt?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "../../data/training-examples.json");

export function getTrainingExamples(): TrainingExample[] {
  try {
    if (!existsSync(DATA_FILE)) return [];
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { examples: TrainingExample[] };
    return parsed.examples ?? [];
  } catch {
    return [];
  }
}
