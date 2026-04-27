import type { AppConfig } from "../config/types";
import { isAppError } from "../common/errors";
import { summarizeError } from "../common/error-utils";
import { createLogger } from "../common/logger";
import { handleChatRequest } from "./routes/chat";

const log = createLogger("server");

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

export function createFetchHandler(config: AppConfig): (req: Request) => Promise<Response> | Response {
  return async (req: Request) => {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/healthz" && req.method === "GET") {
        return Response.json({ status: "ok" }, { status: 200 });
      }

      if (url.pathname === "/api/chat") {
        return await handleChatRequest(req, config);
      }

      return jsonError(404, "NOT_FOUND", "路由不存在", { path: url.pathname });
    } catch (error) {
      const summary = summarizeError(error, "INTERNAL_SERVER_ERROR");

      if (isAppError(error)) {
        log.error(error.message, { code: error.code, details: error.details, cause: error.cause });
      } else if (error instanceof Error) {
        log.error("未处理异常", { code: summary.code, cause: error });
      } else {
        log.error("发生未知异常", { code: summary.code, details: { error } });
      }

      return jsonError(500, summary.code, summary.message, summary.details);
    }
  };
}

export function startServer(config: AppConfig): { port: number; stop: () => void } {
  const server = Bun.serve({
    port: config.server_port,
    fetch: createFetchHandler(config)
  });

  log.info("listening", { details: { port: server.port ?? config.server_port } });

  return {
    port: config.server_port,
    stop: () => server.stop(true)
  };
}

