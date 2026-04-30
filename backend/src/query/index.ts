import type { AppConfig } from "../config/types";
import { createLogger } from "../common/logger";
import { createQueryEmbedder, type QueryEmbedder } from "./embed-query";
import { createRetriever, type Retriever } from "./retriever";
import { createQueryPlanner, type QueryPlanner } from "./query-planner";
import { mapCandidatesToSources } from "./source-mapper";
import type { RetrievalCandidate, RetrievalResult } from "./types";

export type { QueryEmbedder } from "./embed-query";
export type { Retriever } from "./retriever";
export { createQueryEmbedder } from "./embed-query";
export { createRetriever } from "./retriever";
export { createQueryPlanner, normalizeQueryPlan, parseQueryPlanContent } from "./query-planner";
export { mapCandidateToSource, mapCandidatesToSources } from "./source-mapper";
export type { RetrievalCandidate, RetrievalResult, Source } from "./types";
export type { QueryPlan, QueryPlanner } from "./query-planner";

const log = createLogger("query");

export interface RunRetrievalDeps {
  embedder?: QueryEmbedder;
  retriever?: Retriever;
  queryPlanner?: QueryPlanner;
}

const PER_QUERY_TOP_K = 3;
const MERGED_CANDIDATE_LIMIT = 10;
const PROMPT_SOURCE_LIMIT = 5;

function mergeAndRankCandidates(results: Array<{ query: string; candidates: RetrievalCandidate[] }>): RetrievalCandidate[] {
  const byChunk = new Map<string, RetrievalCandidate>();

  for (const result of results) {
    for (const candidate of result.candidates) {
      const existing = byChunk.get(candidate.chunk_id);
      if (!existing) {
        byChunk.set(candidate.chunk_id, {
          ...candidate,
          hit_count: 1,
          matched_queries: [result.query]
        });
        continue;
      }

      existing.hit_count = (existing.hit_count ?? 1) + 1;
      existing.matched_queries = [...(existing.matched_queries ?? []), result.query];
      if (candidate.score > existing.score) {
        existing.score = candidate.score;
        existing.payload = candidate.payload;
      }
    }
  }

  const merged = [...byChunk.values()].map((candidate) => {
    const hitCount = candidate.hit_count ?? 1;
    return {
      ...candidate,
      rank_score: candidate.score + Math.min(hitCount - 1, 3) * 0.03
    };
  });

  merged.sort((a, b) => {
    const rankDiff = (b.rank_score ?? b.score) - (a.rank_score ?? a.score);
    return rankDiff !== 0 ? rankDiff : b.score - a.score;
  });

  return merged.slice(0, MERGED_CANDIDATE_LIMIT);
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
  const queryPlanner = deps.queryPlanner ?? createQueryPlanner(config);

  let retrievalQueries: string[];
  try {
    const plan = await queryPlanner.plan(question);
    retrievalQueries = plan.retrieval_queries.length > 0 ? plan.retrieval_queries : [question];
  } catch (error) {
    log.warn("query planner failed, fallback to original question", {
      details: { error: error instanceof Error ? error.message : String(error) }
    });
    retrievalQueries = [question];
  }

  const perQueryResults = await Promise.all(
    retrievalQueries.map(async (query) => {
      const vector = await embedder.embed(query);
      const candidates = await retriever.retrieve(vector, { limitOverride: PER_QUERY_TOP_K });
      return { query, candidates };
    })
  );

  const candidates = mergeAndRankCandidates(perQueryResults);

  if (candidates.length === 0) {
    log.info("retrieval empty", {
      details: {
        top_k: config.top_k,
        similarity_threshold: config.similarity_threshold,
        query_count: retrievalQueries.length
      }
    });
    return { candidates: [], sources: [], empty: true };
  }

  const sources = mapCandidatesToSources(candidates.slice(0, PROMPT_SOURCE_LIMIT));
  return { candidates, sources, empty: false };
}
