import { loadConfig, resetConfigCache } from "../../config";

async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });

  console.log(
    JSON.stringify(
      {
        sources: config.sources,
        chunk_size: config.chunk_size,
        chunk_overlap: config.chunk_overlap,
        min_chunk_length: config.min_chunk_length,
        top_k: config.top_k,
        similarity_threshold: config.similarity_threshold,
        ollama_base_url: config.ollama_base_url,
        llm_model: config.llm_model,
        embedding_model: config.embedding_model,
        llm_temperature: config.llm_temperature,
        llm_max_tokens: config.llm_max_tokens,
        server_port: config.server_port,
        qdrant_collection_name: config.qdrant_collection_name,
        embedding_dimensions: config.embedding_dimensions,
        qdrant_path: config.qdrant_path,
        ledger_path: config.ledger_path
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
