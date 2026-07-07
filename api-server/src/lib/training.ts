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

function resolveTrainingFile(): string {
  const candidates = [
    join(__dirname, "training-examples.json"),
    join(__dirname, "data/training-examples.json"),
    join(__dirname, "../../data/training-examples.json"),
    join(__dirname, "../data/training-examples.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[1]!;
}

export function getTrainingExamples(): TrainingExample[] {
  try {
    const dataFile = resolveTrainingFile();
    if (!existsSync(dataFile)) return [];
    const raw = readFileSync(dataFile, "utf-8");
    const parsed = JSON.parse(raw) as { examples: TrainingExample[] };
    return parsed.examples ?? [];
  } catch {
    return [];
  }
}
