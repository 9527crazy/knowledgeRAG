import type { AppConfig } from "../config/types";
import { createLogger } from "../common/logger";
import { QUERY_PLANNER_SYSTEM_PROMPT, buildQueryPlannerUserPrompt } from "./query-planner-prompt";

const log = createLogger("query-planner");

export interface QueryPlan {
  original_question: string;
  retrieval_queries: string[];
}

export interface QueryPlanner {
  plan(question: string): Promise<QueryPlan>;
}

export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface QueryPlannerDeps {
  fetchFn?: FetchFn;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function fallbackPlan(question: string): QueryPlan {
  const original = question.trim();
  return {
    original_question: original,
    retrieval_queries: original.length > 0 ? [original] : []
  };
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeQueryPlan(question: string, raw: unknown): QueryPlan {
  const original = question.trim();
  if (!isRecord(raw) || !Array.isArray(raw.retrieval_queries)) {
    return fallbackPlan(original);
  }

  const seen = new Set<string>();
  const queries: string[] = [];

  function addQuery(value: unknown): void {
    if (typeof value !== "string") {
      return;
    }
    const q = value.trim();
    if (q.length === 0 || seen.has(q)) {
      return;
    }
    seen.add(q);
    queries.push(q);
  }

  addQuery(original);
  for (const q of raw.retrieval_queries) {
    if (queries.length >= 5) {
      break;
    }
    addQuery(q);
  }

  return {
    original_question: typeof raw.original_question === "string" && raw.original_question.trim().length > 0 ? raw.original_question.trim() : original,
    retrieval_queries: queries.length > 0 ? queries : fallbackPlan(original).retrieval_queries
  };
}

export function parseQueryPlanContent(question: string, content: string): QueryPlan {
  try {
    return normalizeQueryPlan(question, JSON.parse(extractJsonObject(content)) as unknown);
  } catch {
    return fallbackPlan(question);
  }
}

export function createQueryPlanner(config: AppConfig, deps: QueryPlannerDeps = {}): QueryPlanner {
  const fetchFn: FetchFn = deps.fetchFn ?? fetch;
  const baseUrl = normalizeBaseUrl(config.ollama_base_url);

  return {
    async plan(question: string): Promise<QueryPlan> {
      const original = question.trim();
      if (original.length === 0) {
        return fallbackPlan(original);
      }

      const url = new URL("api/chat", baseUrl).toString();

      try {
        const response = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            model: config.llm_model,
            messages: [
              { role: "system", content: QUERY_PLANNER_SYSTEM_PROMPT },
              { role: "user", content: buildQueryPlannerUserPrompt(original) }
            ],
            stream: false,
            options: {
              temperature: config.llm_temperature,
              num_predict: Math.min(config.llm_max_tokens, 512)
            }
          })
        });

        if (!response.ok) {
          log.warn("Query Planner 请求失败，退回原始问题", {
            details: { status: response.status, status_text: response.statusText }
          });
          return fallbackPlan(original);
        }

        const json = (await response.json()) as OllamaChatResponse;
        const content = json.message?.content;
        if (typeof content !== "string") {
          log.warn("Query Planner 响应缺少 message.content，退回原始问题");
          return fallbackPlan(original);
        }

        return parseQueryPlanContent(original, content);
      } catch (error) {
        log.warn("Query Planner 调用异常，退回原始问题", {
          details: { error: error instanceof Error ? error.message : String(error) }
        });
        return fallbackPlan(original);
      }
    }
  };
}
