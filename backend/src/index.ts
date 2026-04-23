import { loadConfig } from "../config";
import { isAppError } from "./common/errors";
import { createLogger } from "./common/logger";

const logger = createLogger("bootstrap");

async function main(): Promise<void> {
  const config = await loadConfig();

  logger.info("knowledgeRAG backend skeleton started", {
    details: {
      sources: config.sources.length,
      server_port: config.server_port,
      qdrant_path: config.qdrant_path,
      ledger_path: config.ledger_path
    }
  });
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
