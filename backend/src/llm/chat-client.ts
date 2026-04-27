import type { AppConfig } from "../config/types";
import { OllamaError } from "../common/errors";
import { createLogger } from "../common/logger";

const log = createLogger("chat-client");

type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatStreamOptions {
  signal?: AbortSignal | undefined;
}

export interface ChatClient {
  streamChat(messages: ChatMessage[], options?: ChatStreamOptions): AsyncIterable<string>;
}

interface OllamaChatDelta {
  message?: {
    role?: string;
    content?: string;
  };
  done?: boolean;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function mergeSignals(primary: AbortSignal, secondary: AbortSignal | undefined): AbortSignal {
  if (!secondary) {
    return primary;
  }
  return AbortSignal.any([primary, secondary]);
}

function safeJsonParse(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

function extractDeltaContent(payload: unknown): { content?: string; done?: boolean } {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const p = payload as OllamaChatDelta;
  const out: { content?: string; done?: boolean } = {};
  if (typeof p.message?.content === "string") {
    out.content = p.message.content;
  }
  if (typeof p.done === "boolean") {
    out.done = p.done;
  }
  return out;
}

export function createChatClient(config: AppConfig): ChatClient {
  const baseUrl = normalizeBaseUrl(config.ollama_base_url);

  return {
    async *streamChat(messages: ChatMessage[], options: ChatStreamOptions = {}): AsyncIterable<string> {
      const url = new URL("api/chat", baseUrl).toString();

      log.info("ollama chat invoked", {
        details: {
          model: config.llm_model
        }
      });

      const timeoutSignal = AbortSignal.timeout(180_000);
      const signal = mergeSignals(timeoutSignal, options.signal);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson, application/json"
          },
          body: JSON.stringify({
            model: config.llm_model,
            messages,
            stream: true,
            options: {
              temperature: config.llm_temperature,
              num_predict: config.llm_max_tokens
            }
          }),
          signal
        });
      } catch (error) {
        throw new OllamaError("无法连接 Ollama Chat 接口", {
          cause: error,
          details: { url }
        });
      }

      if (!response.ok) {
        throw new OllamaError("Ollama Chat 请求失败", {
          details: {
            url,
            status: response.status,
            status_text: response.statusText
          }
        });
      }

      if (!response.body) {
        throw new OllamaError("Ollama Chat 响应缺少 body", {
          details: { url }
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const nl = buffer.indexOf("\n");
            if (nl < 0) {
              break;
            }

            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);

            if (line.length === 0) {
              continue;
            }

            const parsed = safeJsonParse(line);
            if (parsed === undefined) {
              throw new OllamaError("Ollama Chat 响应行不是合法 JSON", {
                details: {
                  url,
                  raw_preview: line.slice(0, 800)
                }
              });
            }

            const { content, done: doneFlag } = extractDeltaContent(parsed);
            if (content && content.length > 0) {
              yield content;
            }

            if (doneFlag === true) {
              return;
            }
          }
        }

        // Flush any remaining decoder bytes.
        buffer += decoder.decode();
        const tail = buffer.trim();
        if (tail.length > 0) {
          const parsed = safeJsonParse(tail);
          if (parsed === undefined) {
            throw new OllamaError("Ollama Chat 响应行不是合法 JSON", {
              details: {
                url,
                raw_preview: tail.slice(0, 800)
              }
            });
          }

          const { content, done: doneFlag } = extractDeltaContent(parsed);
          if (content && content.length > 0) {
            yield content;
          }
          if (doneFlag === true) {
            return;
          }
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
      }
    }
  };
}
