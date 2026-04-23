import { loadConfig, resetConfigCache } from "../../config";
import { summarizeError } from "../common/error-utils";
import { createOllamaClient } from "../llm/ollama-client";
import { createQdrantStore } from "../store/qdrant";
import { createLedgerStore } from "../store/ledger";

interface HealthCheckResult {
  ollama: Record<string, unknown>;
  qdrant: Record<string, unknown>;
  ledger: Record<string, unknown>;
}

async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });
  let hasFailure = false;

  const result: HealthCheckResult = {
    ollama: {
      ok: false,
      reachable: false,
      base_url: config.ollama_base_url,
      llm_model: config.llm_model,
      llm_model_ready: false,
      embedding_model: config.embedding_model,
      embedding_model_ready: false
    },
    qdrant: {
      ok: false,
      url: "http://127.0.0.1:6333",
      local_path: config.qdrant_path,
      collection: config.qdrant_collection_name,
      vector_size: config.embedding_dimensions
    },
    ledger: {
      ok: false,
      path: config.ledger_path,
      table: "document_index",
      table_exists: false
    }
  };

  try {
    const ollamaClient = createOllamaClient(config);
    const [health, llmModelReady, embeddingModelReady] = await Promise.all([
      ollamaClient.checkHealth(),
      ollamaClient.checkModelExists(config.llm_model),
      ollamaClient.checkModelExists(config.embedding_model)
    ]);

    result.ollama = {
      ok: health.reachable && llmModelReady && embeddingModelReady,
      reachable: health.reachable,
      base_url: health.base_url,
      model_count: health.model_count,
      llm_model: config.llm_model,
      llm_model_ready: llmModelReady,
      embedding_model: config.embedding_model,
      embedding_model_ready: embeddingModelReady
    };

    if (!result.ollama.ok) {
      hasFailure = true;
    }
  } catch (error) {
    hasFailure = true;
    result.ollama = {
      ...result.ollama,
      error: summarizeError(error, "OLLAMA_HEALTH_CHECK_FAILED")
    };
  }

  try {
    const qdrantStore = createQdrantStore(config);
    result.qdrant = { ...(await qdrantStore.ensureCollection()) };
  } catch (error) {
    hasFailure = true;
    result.qdrant = {
      ...result.qdrant,
      error: summarizeError(error, "QDRANT_HEALTH_CHECK_FAILED")
    };
  }

  const ledgerStore = createLedgerStore(config);
  try {
    result.ledger = { ...(await ledgerStore.ensureSchema()) };
  } catch (error) {
    hasFailure = true;
    result.ledger = {
      ...result.ledger,
      error: summarizeError(error, "LEDGER_HEALTH_CHECK_FAILED")
    };
  } finally {
    ledgerStore.close();
  }

  console.log(JSON.stringify(result, null, 2));

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        fatal: summarizeError(error, "HEALTH_CHECK_FATAL")
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
