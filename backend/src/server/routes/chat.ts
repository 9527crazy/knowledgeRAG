import type { AppConfig } from "../../config/types";
import { ValidationError } from "../../common/errors";
import { summarizeError } from "../../common/error-utils";
import type { ChatService } from "../../service/chat-service";
import { createChatService } from "../../service/chat-service";
import { encodeSseEvent, SSE_RESPONSE_HEADERS } from "../sse";

function jsonError(status: number, code: string, message: string, details?: Record<string, unknown>): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    },
    { status }
  );
}

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (error) {
    throw new ValidationError("请求体必须是合法 JSON", { cause: error });
  }
}

function validateQuestion(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new ValidationError("请求体必须是对象");
  }

  const question = (body as { question?: unknown }).question;
  if (typeof question !== "string") {
    throw new ValidationError("question 必须是 string");
  }

  const trimmed = question.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("question 不能为空");
  }

  return trimmed;
}

export interface HandleChatDeps {
  service?: ChatService;
}

export async function handleChatRequest(req: Request, config: AppConfig, deps: HandleChatDeps = {}): Promise<Response> {
  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "只支持 POST");
  }

  try {
    const body = await parseJsonBody(req);
    const question = validateQuestion(body);
    const service = deps.service ?? createChatService(config);
    const encoder = new TextEncoder();

    let aborted = false;
    const abort = (): void => {
      aborted = true;
    };

    if (req.signal) {
      if (req.signal.aborted) {
        abort();
      } else {
        req.signal.addEventListener("abort", abort, { once: true });
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const ev of service.streamAnswer(question)) {
            if (aborted) {
              break;
            }

            if (ev.type === "sources") {
              controller.enqueue(encoder.encode(encodeSseEvent("sources", { items: ev.items })));
              continue;
            }

            if (ev.type === "delta") {
              controller.enqueue(encoder.encode(encodeSseEvent("delta", { text: ev.text })));
              continue;
            }

            if (ev.type === "error") {
              controller.enqueue(encoder.encode(encodeSseEvent("error", { message: ev.message })));
              controller.enqueue(encoder.encode(encodeSseEvent("done")));
              controller.close();
              return;
            }

            if (ev.type === "done") {
              controller.enqueue(encoder.encode(encodeSseEvent("done")));
              controller.close();
              return;
            }
          }
        } catch (error) {
          const summary = summarizeError(error, "CHAT_STREAM_ERROR");
          try {
            controller.enqueue(encoder.encode(encodeSseEvent("error", { message: summary.message })));
            controller.enqueue(encoder.encode(encodeSseEvent("done")));
          } finally {
            controller.close();
          }
        }
      },
      cancel() {
        abort();
      }
    });

    return new Response(stream, { status: 200, headers: SSE_RESPONSE_HEADERS });
  } catch (error) {
    const summary = summarizeError(error, "BAD_REQUEST");
    const status = summary.code === "VALIDATION_ERROR" ? 400 : 500;
    return jsonError(status, summary.code, summary.message, summary.details);
  }
}

