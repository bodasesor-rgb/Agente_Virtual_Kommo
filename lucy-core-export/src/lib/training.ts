export interface TrainingExample {
  id: string;
  userMessage: string;
  lucyResponse: string;
  label?: string;
  createdAt?: string;
}

export { getTrainingExamples } from "../services/trainingStore.js";
