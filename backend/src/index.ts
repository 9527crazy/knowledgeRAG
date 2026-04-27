import { loadConfig } from "../config";
import { isAppError } from "./common/errors";
import { createLogger } from "./common/logger";
import { startServer } from "./server/app";

const logger = createLogger("bootstrap");

async function main(): Promise<void> {
  const config = await loadConfig();

  logger.info("knowledgeRAG backend skeleton started", {
    details: {
      mode: "http",
      sources: config.sources.length,
      server_port: config.server_port,
      qdrant_collection_name: config.qdrant_collection_name,
      embedding_dimensions: config.embedding_dimensions,
      qdrant_path: config.qdrant_path,
      ledger_path: config.ledger_path
    }
  });

  const server = startServer(config);
  const stop = (): void => {
    logger.info("shutdown", { details: { port: server.port } });
    server.stop();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error: unknown) => {
  if (isAppError(error)) {
    logger.error(error.message, {
      code: error.code,
      details: error.details,
      cause: error.cause
    });
  } else if (error instanceof Error) {
    logger.error("未处理异常", {
      code: "UNHANDLED_ERROR",
      cause: error
    });
  } else {
    logger.error("发生未知异常", {
      code: "UNKNOWN_THROWABLE",
      details: { error }
    });
  }

  process.exitCode = 1;
});
