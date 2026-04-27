import { QdrantClient } from "@qdrant/js-client-rest";
import type { AppConfig } from "../config/types";
import { isAppError } from "../common/errors";
import { summarizeError } from "../common/error-utils";
import { createLogger } from "../common/logger";
import { createEmbedder } from "../ingest/embedder";
import { createLedgerStore } from "../store/ledger";
import { createVectorRepository } from "../store/vector-repository";
import { DEFAULT_QDRANT_URL } from "../store/qdrant";
import { handleChatRequest } from "./routes/chat";
import { handleReindexRequest } from "./routes/reindex";
import { handleStatusRequest } from "./routes/status";

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

export function createFetchHandler(config: AppConfig): {
  fetch: (req: Request) => Promise<Response> | Response;
  close: () => void;
} {
  let ledger: ReturnType<typeof createLedgerStore> | undefined;
  let embedder: ReturnType<typeof createEmbedder> | undefined;
  let vectorRepo: ReturnType<typeof createVectorRepository> | undefined;
  let qdrantClient: QdrantClient | undefined;

  const getLedger = (): ReturnType<typeof createLedgerStore> => (ledger ??= createLedgerStore(config));
  const getEmbedder = (): ReturnType<typeof createEmbedder> => (embedder ??= createEmbedder(config));
  const getVectorRepo = (): ReturnType<typeof createVectorRepository> => (vectorRepo ??= createVectorRepository(config));
  const getQdrant = (): QdrantClient => (qdrantClient ??= new QdrantClient({ url: DEFAULT_QDRANT_URL, checkCompatibility: false }));

  const close = (): void => {
    ledger?.close();
  };

  const fetch = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/healthz" && req.method === "GET") {
        return Response.json({ status: "ok" }, { status: 200 });
      }

      if (url.pathname === "/api/status" && req.method === "GET") {
        return await handleStatusRequest(req, {
          config,
          ledger: getLedger(),
          qdrantClient: getQdrant()
        });
      }

      if (url.pathname === "/api/reindex") {
        return await handleReindexRequest(req, {
          config,
          ledger: getLedger(),
          vectorRepo: getVectorRepo(),
          embedder: getEmbedder()
        });
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

  return { fetch, close };
}

export function startServer(config: AppConfig): { port: number; stop: () => void } {
  const { fetch, close } = createFetchHandler(config);

  const server = Bun.serve({
    port: config.server_port,
    fetch
  });

  log.info("listening", { details: { port: server.port ?? config.server_port } });

  return {
    port: config.server_port,
    stop: () => {
      close();
      server.stop(true);
    }
  };
}
