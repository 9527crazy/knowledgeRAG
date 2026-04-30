import { describe, expect, test } from "bun:test";
import type { AppConfig } from "../src/config/types";
import { createQueryPlanner, normalizeQueryPlan, parseQueryPlanContent } from "../src/query/query-planner";

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

describe("query planner", () => {
  test("合法 JSON：解析并强制保留原始问题", () => {
    const out = parseQueryPlanContent(
      "原问题",
      JSON.stringify({
        original_question: "原问题",
        retrieval_queries: ["改写 A", "改写 B", "改写 C"]
      })
    );

    expect(out.retrieval_queries).toEqual(["原问题", "改写 A", "改写 B", "改写 C"]);
  });

  test("清理空字符串、重复项并截断到 5 条", () => {
    const out = normalizeQueryPlan("原问题", {
      original_question: "原问题",
      retrieval_queries: ["", "原问题", "A", "A", "B", "C", "D", "E"]
    });

    expect(out.retrieval_queries).toEqual(["原问题", "A", "B", "C", "D"]);
  });

  test("非法 JSON：退回原始问题", () => {
    const out = parseQueryPlanContent("原问题", "not json");
    expect(out.retrieval_queries).toEqual(["原问题"]);
  });

  test("请求失败：退回原始问题", async () => {
    const planner = createQueryPlanner(testConfig, {
      fetchFn: async () => {
        throw new Error("boom");
      }
    });

    const out = await planner.plan("原问题");
    expect(out.retrieval_queries).toEqual(["原问题"]);
  });

  test("非流式 Ollama 响应：读取 message.content", async () => {
    const planner = createQueryPlanner(testConfig, {
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                original_question: "原问题",
                retrieval_queries: ["原问题", "改写"]
              })
            }
          }),
          { status: 200 }
        )
    });

    const out = await planner.plan("原问题");
    expect(out.retrieval_queries).toEqual(["原问题", "改写"]);
  });
});
