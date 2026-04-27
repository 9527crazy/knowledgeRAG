import { fetchEventSource } from "@microsoft/fetch-event-source";
import { buildUrl } from "./base";
import type {
  ApiErrorBody,
  ChatStreamHandlers,
  SseDeltaPayload,
  SseErrorPayload,
  SseSourcesPayload
} from "../types";

class FatalSseError extends Error {}

export interface StreamChatOptions extends ChatStreamHandlers {
  question: string;
  signal?: AbortSignal;
}

export async function streamChat(options: StreamChatOptions): Promise<void> {
  const { question, signal, onSources, onDelta, onDone, onError } = options;

  let doneFired = false;
  const fireDone = (): void => {
    if (doneFired) {
      return;
    }
    doneFired = true;
    onDone?.();
  };

  const init: Parameters<typeof fetchEventSource>[1] = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ question }),
    openWhenHidden: true,
    async onopen(response) {
      const ctype = response.headers.get("Content-Type") ?? "";
      if (response.ok && ctype.includes("text/event-stream")) {
        return;
      }

      let message = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        if (text.length > 0) {
          try {
            const data = JSON.parse(text) as Partial<ApiErrorBody>;
            if (data?.error?.message) {
              message = data.error.message;
            }
          } catch {
            message = text.slice(0, 240);
          }
        }
      } catch {
        // ignore
      }
      throw new FatalSseError(message);
    },
    onmessage(ev) {
      if (!ev.event) {
        return;
      }
      try {
        if (ev.event === "delta") {
          const data = JSON.parse(ev.data || "{}") as SseDeltaPayload;
          if (typeof data.text === "string" && data.text.length > 0) {
            onDelta?.(data.text);
          }
          return;
        }
        if (ev.event === "sources") {
          const data = JSON.parse(ev.data || "{}") as SseSourcesPayload;
          if (Array.isArray(data.items)) {
            onSources?.(data.items);
          }
          return;
        }
        if (ev.event === "error") {
          const data = JSON.parse(ev.data || "{}") as SseErrorPayload;
          onError?.(data.message ?? "未知错误");
          return;
        }
        if (ev.event === "done") {
          fireDone();
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "无法解析 SSE 事件";
        onError?.(message);
      }
    },
    onclose() {
      fireDone();
    },
    onerror(err) {
      if (err instanceof FatalSseError) {
        onError?.(err.message);
        fireDone();
        throw err;
      }
      const message = err instanceof Error ? err.message : "网络异常，连接中断";
      onError?.(message);
      fireDone();
      throw err;
    }
  };

  if (signal) {
    init.signal = signal;
  }

  try {
    await fetchEventSource(buildUrl("/api/chat"), init);
  } catch (err) {
    if ((err as { name?: string } | undefined)?.name === "AbortError") {
      fireDone();
      return;
    }
    if (err instanceof FatalSseError) {
      return;
    }
    throw err;
  }
}
