import type { AppConfig } from "../config/types";
import { ValidationError } from "../common/errors";
import { createEmbedder, type Embedder } from "../ingest/embedder";

export interface QueryEmbedder {
  embed(question: string): Promise<number[]>;
}

export function createQueryEmbedder(config: AppConfig, embedder: Embedder = createEmbedder(config)): QueryEmbedder {
  return {
    async embed(question: string): Promise<number[]> {
      const trimmed = question.trim();
      if (trimmed.length === 0) {
        throw new ValidationError("question 不能为空");
      }
      return embedder.embed(trimmed);
    }
  };
}

