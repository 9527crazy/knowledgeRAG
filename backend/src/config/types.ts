export interface SourceConfig {
  name: string;
  path: string;
  include: string[];
  recursive: boolean;
}

export interface AppConfig {
  sources: SourceConfig[];
  chunk_size: number;
  chunk_overlap: number;
  min_chunk_length: number;
  top_k: number;
  similarity_threshold: number;
  ollama_base_url: string;
  llm_model: string;
  embedding_model: string;
  llm_temperature: number;
  llm_max_tokens: number;
  server_port: number;
  qdrant_path: string;
  ledger_path: string;
}

export type AppConfigInput = Omit<Partial<AppConfig>, "sources"> & {
  sources?: Array<Partial<SourceConfig>> | undefined;
};
