import type { AppConfig } from "../config/types";
import { OllamaError } from "../common/errors";

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

type OllamaEmbeddingResponse =
  | { embedding?: number[] }
  | { embeddings?: number[][] }
  | { data?: Array<{ embedding?: number[] }> };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 400;

/** Ollama `POST /api/embeddings`；同一文本最多尝试 4 次（首次 + 3 次重试），对齐需求「重试 3 次」 */
export function createEmbedder(config: AppConfig): Embedder {
  const baseUrl = normalizeBaseUrl(config.ollama_base_url);

  function extractEmbedding(payload: OllamaEmbeddingResponse): number[] | undefined {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    // Old: { embedding: number[] }
    const maybeEmbedding = (payload as { embedding?: unknown }).embedding;
    if (Array.isArray(maybeEmbedding) && maybeEmbedding.every((v) => typeof v === "number")) {
      return maybeEmbedding as number[];
    }

    // Newer: { embeddings: number[][] } (single input -> embeddings[0])
    const maybeEmbeddings = (payload as { embeddings?: unknown }).embeddings;
    if (Array.isArray(maybeEmbeddings) && maybeEmbeddings.length > 0 && Array.isArray(maybeEmbeddings[0])) {
      const first = maybeEmbeddings[0] as unknown[];
      if (first.every((v) => typeof v === "number")) {
        return first as number[];
      }
    }

    // OpenAI-like: { data: [{ embedding: number[] }] }
    const maybeData = (payload as { data?: unknown }).data;
    if (Array.isArray(maybeData) && maybeData.length > 0) {
      const first = maybeData[0] as { embedding?: unknown };
      if (first && Array.isArray(first.embedding) && first.embedding.every((v) => typeof v === "number")) {
        return first.embedding as number[];
      }
    }

    return undefined;
  }

  async function postEmbedding(url: string, body: Record<string, unknown>): Promise<{ payload: OllamaEmbeddingResponse; raw: string }> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000)
      });
    } catch (error) {
      throw new OllamaError("无法连接 Ollama Embedding 接口", {
        cause: error,
        details: { url }
      });
    }

    if (!response.ok) {
      throw new OllamaError("Ollama Embedding 请求失败", {
        details: {
          url,
          status: response.status,
          status_text: response.statusText
        }
      });
    }

    let raw = "";
    try {
      raw = await response.text();
    } catch (error) {
      throw new OllamaError("读取 Ollama Embedding 响应失败", {
        cause: error,
        details: { url }
      });
    }

    try {
      return { payload: JSON.parse(raw) as OllamaEmbeddingResponse, raw };
    } catch (error) {
      throw new OllamaError("Ollama Embedding 响应不是合法 JSON", {
        cause: error,
        details: { url, raw_preview: raw.slice(0, 800) }
      });
    }
  }

  async function embedOnce(text: string): Promise<number[]> {
    const urlEmbeddings = new URL("api/embeddings", baseUrl).toString();
    const urlEmbed = new URL("api/embed", baseUrl).toString();

    // 兼容不同 Ollama 版本：
    // - /api/embeddings: 常见字段是 prompt（部分版本也接受 input，但会导致返回空 embedding）
    // - /api/embed: 常见字段是 input，返回 embeddings: number[][]
    const attempts: Array<{ url: string; body: Record<string, unknown>; hint: string }> = [
      { url: urlEmbeddings, body: { model: config.embedding_model, prompt: text }, hint: "api/embeddings + prompt" },
      { url: urlEmbed, body: { model: config.embedding_model, input: text }, hint: "api/embed + input" },
      { url: urlEmbeddings, body: { model: config.embedding_model, input: text }, hint: "api/embeddings + input" }
    ];

    let lastRawPreview: string | undefined;
    let lastHint: string | undefined;
    for (const attempt of attempts) {
      const { payload, raw } = await postEmbedding(attempt.url, attempt.body);
      const embedding = extractEmbedding(payload);
      if (embedding && embedding.length > 0) {
        if (embedding.length !== config.embedding_dimensions) {
          throw new OllamaError("Embedding 维度与配置 embedding_dimensions 不一致", {
            details: {
              expected: config.embedding_dimensions,
              actual: embedding.length,
              model: config.embedding_model,
              url: attempt.url,
              attempt: attempt.hint
            }
          });
        }
        return embedding;
      }

      lastRawPreview = raw.slice(0, 800);
      lastHint = attempt.hint;
    }

    throw new OllamaError("Ollama Embedding 响应缺少可用的 embedding 数组", {
      details: {
        model: config.embedding_model,
        attempted: lastHint,
        raw_preview: lastRawPreview
      }
    });

    // unreachable
  }

  return {
    async embed(text: string): Promise<number[]> {
      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          return await embedOnce(text);
        } catch (error) {
          lastError = error;
          if (attempt < MAX_ATTEMPTS - 1) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
          }
        }
      }
      throw lastError;
    }
  };
}
