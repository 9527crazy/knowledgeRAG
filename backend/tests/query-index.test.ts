import { describe, expect, test } from "bun:test";
import type { AppConfig } from "../src/config/types";
import { runRetrieval } from "../src/query";
import type { QueryEmbedder, QueryPlanner, Retriever } from "../src/query";
import type { RetrievalCandidate } from "../src/query/types";

const testConfig: AppConfig = {
  sources: [],
  chunk_size: 500,
  chunk_overlap: 80,
  min_chunk_length: 50,
  top_k: 6,
  similarity_threshold: 0.5,
  ollama_base_url: "http://localhost:11434",
  llm_model: "q",
  embedding_model: "b",
  llm_temperature: 0.1,
  llm_max_tokens: 2048,
  server_port: 3000,
  qdrant_collection_name: "c",
  embedding_dimensions: 1024,
  qdrant_path: "./data/qdrant",
  ledger_path: "./data/ledger.db"
};

function candidate(id: string, score: number, text = "body"): RetrievalCandidate {
  return {
    chunk_id: id,
    score,
    payload: {
      doc_id: `doc-${id}`,
      source_path: `/${id}.md`,
      source_name: "s",
      doc_title: `title-${id}`,
      doc_type: "md",
      section_title: "section",
      chunk_text: text,
      chunk_index: 0,
      total_chunks: 1,
      char_count: text.length,
      indexed_at: 1
    }
  };
}

describe("runRetrieval multi-query", () => {
  test("多 query 并行召回后按 chunk_id 去重，并按命中次数重排", async () => {
    const planner: QueryPlanner = {
      async plan() {
        return { original_question: "q0", retrieval_queries: ["q0", "q1"] };
      }
    };

    const embedder: QueryEmbedder = {
      async embed(q: string) {
        return q === "q0" ? [0] : [1];
      }
    };

    const retriever: Retriever = {
      async retrieve(vector, options) {
        expect(options?.limitOverride).toBe(3);
        if (vector[0] === 0) {
          return [candidate("a", 0.72), candidate("b", 0.74)];
        }
        return [candidate("a", 0.76), candidate("c", 0.78)];
      }
    };

    const out = await runRetrieval(testConfig, "q0", { queryPlanner: planner, embedder, retriever });

    expect(out.empty).toBe(false);
    expect(out.candidates.map((c) => c.chunk_id)).toEqual(["a", "c", "b"]);
    expect(out.candidates[0]!.score).toBe(0.76);
    expect(out.candidates[0]!.hit_count).toBe(2);
    expect(out.sources.map((s) => s.chunk_id)).toEqual(["a", "c", "b"]);
  });

  test("无候选时返回 empty", async () => {
    const out = await runRetrieval(testConfig, "q", {
      queryPlanner: { async plan() { return { original_question: "q", retrieval_queries: ["q", "q1"] }; } },
      embedder: { async embed() { return [0]; } },
      retriever: { async retrieve() { return []; } }
    });

    expect(out.empty).toBe(true);
    expect(out.sources).toEqual([]);
  });

  test("planner 抛错时退回原始问题单路检索", async () => {
    const seenQueries: string[] = [];
    const out = await runRetrieval(testConfig, "原问题", {
      queryPlanner: { async plan() { throw new Error("boom"); } },
      embedder: {
        async embed(q) {
          seenQueries.push(q);
          return [0];
        }
      },
      retriever: { async retrieve() { return [candidate("a", 0.8)]; } }
    });

    expect(seenQueries).toEqual(["原问题"]);
    expect(out.empty).toBe(false);
    expect(out.sources[0]!.chunk_id).toBe("a");
  });
});
