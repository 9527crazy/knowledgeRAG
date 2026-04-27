import type { AppConfig } from "../config/types";
import { createLogger } from "../common/logger";
import { createQueryEmbedder, type QueryEmbedder } from "./embed-query";
import { createRetriever, type Retriever } from "./retriever";
import { mapCandidatesToSources } from "./source-mapper";
import type { RetrievalResult } from "./types";

export type { QueryEmbedder } from "./embed-query";
export type { Retriever } from "./retriever";
export { createQueryEmbedder } from "./embed-query";
export { createRetriever } from "./retriever";
export { mapCandidateToSource, mapCandidatesToSources } from "./source-mapper";
export type { RetrievalCandidate, RetrievalResult, Source } from "./types";

const log = createLogger("query");

export interface RunRetrievalDeps {
  embedder?: QueryEmbedder;
  retriever?: Retriever;
}

/**
 * 端到端检索编排：question → embedding → Qdrant Top-K → 阈值过滤 → 来源映射。
 *
 * - 当无候选或全部被阈值过滤时，返回 `empty: true`，便于上层短路（不调用 LLM）。
 * - 不在此层做 Prompt 拼装、合并、截断；这些由第 7 天负责。
 */
export async function runRetrieval(
  config: AppConfig,
  question: string,
  deps: RunRetrievalDeps = {}
): Promise<RetrievalResult> {
  const embedder = deps.embedder ?? createQueryEmbedder(config);
  const retriever = deps.retriever ?? createRetriever(config);

  const vector = await embedder.embed(question);
  const candidates = await retriever.retrieve(vector);

  if (candidates.length === 0) {
    log.info("retrieval empty", {
      details: {
        top_k: config.top_k,
        similarity_threshold: config.similarity_threshold
      }
    });
    return { candidates: [], sources: [], empty: true };
  }

  const sources = mapCandidatesToSources(candidates);
  return { candidates, sources, empty: false };
}
