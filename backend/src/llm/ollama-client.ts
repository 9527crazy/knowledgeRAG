import type { AppConfig } from "../config/types";
import { OllamaError } from "../common/errors";

interface OllamaTag {
  name: string;
  model?: string;
}

interface OllamaTagsResponse {
  models?: OllamaTag[];
}

export interface OllamaHealthStatus {
  reachable: boolean;
  base_url: string;
  model_count: number;
}

export interface OllamaClient {
  checkHealth(): Promise<OllamaHealthStatus>;
  listModels(): Promise<string[]>;
  checkModelExists(modelName: string): Promise<boolean>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function parseJsonResponse<T>(response: Response, context: Record<string, unknown>): Promise<T> {
  if (!response.ok) {
    throw new OllamaError("Ollama 请求失败", {
      details: {
        ...context,
        status: response.status,
        status_text: response.statusText
      }
    });
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new OllamaError("Ollama 响应不是合法 JSON", {
      cause: error,
      details: context
    });
  }
}

export function createOllamaClient(config: AppConfig): OllamaClient {
  const baseUrl = normalizeBaseUrl(config.ollama_base_url);

  async function requestJson<T>(pathname: string): Promise<T> {
    const url = new URL(pathname, baseUrl).toString();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
    } catch (error) {
      throw new OllamaError("无法连接 Ollama 服务", {
        cause: error,
        details: { url }
      });
    }

    return parseJsonResponse<T>(response, { url });
  }

  async function listModels(): Promise<string[]> {
    const payload = await requestJson<OllamaTagsResponse>("api/tags");
    return (payload.models ?? []).map((model) => model.name || model.model || "").filter(Boolean);
  }

  return {
    async checkHealth(): Promise<OllamaHealthStatus> {
      const models = await listModels();

      return {
        reachable: true,
        base_url: baseUrl.replace(/\/$/, ""),
        model_count: models.length
      };
    },
    listModels,
    async checkModelExists(modelName: string): Promise<boolean> {
      const models = await listModels();
      return models.includes(modelName);
    }
  };
}
