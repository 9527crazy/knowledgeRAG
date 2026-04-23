import { z } from "zod";

export const sourceConfigSchema = z.object({
  name: z.string().trim().min(1, "sources[].name 不能为空"),
  path: z.string().trim().min(1, "sources[].path 不能为空"),
  include: z.array(z.string().trim().min(1, "sources[].include 不能为空")).min(1, "sources[].include 至少需要一个扩展名"),
  recursive: z.boolean()
});

export const appConfigSchema = z
  .object({
    sources: z.array(sourceConfigSchema).min(1, "sources 至少需要一个目录"),
    chunk_size: z.number().int().positive("chunk_size 必须大于 0"),
    chunk_overlap: z.number().int().nonnegative("chunk_overlap 不能小于 0"),
    min_chunk_length: z.number().int().positive("min_chunk_length 必须大于 0"),
    top_k: z.number().int().positive("top_k 必须大于 0"),
    similarity_threshold: z.number().min(0, "similarity_threshold 不能小于 0").max(1, "similarity_threshold 不能大于 1"),
    ollama_base_url: z.string().trim().url("ollama_base_url 必须是有效 URL"),
    llm_model: z.string().trim().min(1, "llm_model 不能为空"),
    embedding_model: z.string().trim().min(1, "embedding_model 不能为空"),
    llm_temperature: z.number().min(0, "llm_temperature 不能小于 0"),
    llm_max_tokens: z.number().int().positive("llm_max_tokens 必须大于 0"),
    server_port: z.number().int().min(1, "server_port 必须在 1-65535 之间").max(65535, "server_port 必须在 1-65535 之间"),
    qdrant_collection_name: z.string().trim().min(1, "qdrant_collection_name 不能为空"),
    embedding_dimensions: z.number().int().positive("embedding_dimensions 必须大于 0"),
    qdrant_path: z.string().trim().min(1, "qdrant_path 不能为空"),
    ledger_path: z.string().trim().min(1, "ledger_path 不能为空")
  })
  .superRefine((config, ctx) => {
    if (config.chunk_overlap >= config.chunk_size) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "chunk_overlap 必须小于 chunk_size",
        path: ["chunk_overlap"]
      });
    }
  });
