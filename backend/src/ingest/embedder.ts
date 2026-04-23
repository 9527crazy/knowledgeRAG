import type { AppConfig } from "../config/types";
import { OllamaError } from "../common/errors";

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

interface OllamaEmbeddingResponse {
  embedding?: number[];
}

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

  async function embedOnce(text: string): Promise<number[]> {
    const url = new URL("api/embeddings", baseUrl).toString();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model: config.embedding_model,
          input: text
        }),
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

    let payload: OllamaEmbeddingResponse;
    try {
      payload = (await response.json()) as OllamaEmbeddingResponse;
    } catch (error) {
      throw new OllamaError("Ollama Embedding 响应不是合法 JSON", {
        cause: error,
        details: { url }
      });
    }

    const embedding = payload.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new OllamaError("Ollama Embedding 响应缺少 embedding 数组", {
        details: { url }
      });
    }

    if (embedding.length !== config.embedding_dimensions) {
      throw new OllamaError("Embedding 维度与配置 embedding_dimensions 不一致", {
        details: {
          expected: config.embedding_dimensions,
          actual: embedding.length,
          model: config.embedding_model
        }
      });
    }

    return embedding;
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
