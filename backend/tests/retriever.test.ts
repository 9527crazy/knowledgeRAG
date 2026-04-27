import { describe, expect, test } from "bun:test";
import { QdrantError } from "../src/common/errors";
import type { AppConfig } from "../src/config/types";
import { createRetriever, type QdrantSearchClient } from "../src/query/retriever";

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

function fullPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    doc_id: "d1",
    source_path: "/a.md",
    source_name: "s",
    doc_title: "t",
    doc_type: "md",
    section_title: "x",
    chunk_text: "body",
    chunk_index: 0,
    total_chunks: 1,
    char_count: 4,
    indexed_at: 1,
    ...over
  };
}

describe("createRetriever (mock client)", () => {
  test("完整 payload 且 score ≥ 阈值：按 score 降序", async () => {
    const mock = {
      async search() {
        return [
          { id: "a", score: 0.6, payload: fullPayload() },
          { id: "b", score: 0.9, payload: fullPayload({ doc_id: "d2" }) }
        ];
      }
    } as QdrantSearchClient;
    const r = createRetriever(testConfig, { client: mock });
    const out = await r.retrieve([0, 0, 0]);
    expect(out.length).toBe(2);
    expect(out[0]!.score).toBe(0.9);
    expect(out[1]!.score).toBe(0.6);
  });

  test("缺字段的 payload：跳过且不出错", async () => {
    const mock = {
      async search() {
        return [{ id: "a", score: 0.8, payload: { doc_id: "only" } }];
      }
    } as QdrantSearchClient;
    const r = createRetriever(testConfig, { client: mock });
    const out = await r.retrieve([0]);
    expect(out.length).toBe(0);
  });

  test("score < 阈值：兜底过滤", async () => {
    const mock = {
      async search() {
        return [{ id: "a", score: 0.2, payload: fullPayload() }];
      }
    } as QdrantSearchClient;
    const r = createRetriever(testConfig, { client: mock });
    const out = await r.retrieve([0]);
    expect(out.length).toBe(0);
  });

  test("search 抛错：封装为 QdrantError", async () => {
    const mock = {
      async search() {
        throw new Error("boom");
      }
    } as QdrantSearchClient;
    const r = createRetriever(testConfig, { client: mock });
    await expect(r.retrieve([0])).rejects.toThrow(QdrantError);
  });
});
