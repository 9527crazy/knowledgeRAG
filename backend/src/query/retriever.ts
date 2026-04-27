import { QdrantClient } from "@qdrant/js-client-rest";
import type { AppConfig } from "../config/types";
import { QdrantError } from "../common/errors";
import { createLogger } from "../common/logger";
import { DEFAULT_QDRANT_URL } from "../store/qdrant";
import type { ChunkPayload } from "../store/vector-repository";
import type { RetrievalCandidate } from "./types";

const log = createLogger("retriever");

export interface Retriever {
  retrieve(vector: number[]): Promise<RetrievalCandidate[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function readNumberField(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
}

function tryParseChunkPayload(payload: unknown): ChunkPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const doc_id = readStringField(payload, "doc_id");
  const source_path = readStringField(payload, "source_path");
  const source_name = readStringField(payload, "source_name");
  const doc_title = readStringField(payload, "doc_title");
  const doc_type = readStringField(payload, "doc_type");
  const section_title = readStringField(payload, "section_title");
  const chunk_text = readStringField(payload, "chunk_text");
  const chunk_index = readNumberField(payload, "chunk_index");
  const total_chunks = readNumberField(payload, "total_chunks");
  const char_count = readNumberField(payload, "char_count");
  const indexed_at = readNumberField(payload, "indexed_at");

  if (
    doc_id === undefined ||
    source_path === undefined ||
    source_name === undefined ||
    doc_title === undefined ||
    doc_type === undefined ||
    section_title === undefined ||
    chunk_text === undefined ||
    chunk_index === undefined ||
    total_chunks === undefined ||
    char_count === undefined ||
    indexed_at === undefined
  ) {
    return undefined;
  }

  return {
    doc_id,
    source_path,
    source_name,
    doc_title,
    doc_type,
    section_title,
    chunk_text,
    chunk_index,
    total_chunks,
    char_count,
    indexed_at
  };
}

function normalizePointId(id: unknown): string {
  if (typeof id === "string") {
    return id;
  }
  if (typeof id === "number") {
    return String(id);
  }
  try {
    return JSON.stringify(id);
  } catch {
    return String(id);
  }
}

export function createRetriever(config: AppConfig): Retriever {
  const client = new QdrantClient({ url: DEFAULT_QDRANT_URL, checkCompatibility: false });
  const collection = config.qdrant_collection_name;

  return {
    async retrieve(vector: number[]): Promise<RetrievalCandidate[]> {
      try {
        const points = await client.search(collection, {
          vector,
          limit: config.top_k,
          with_payload: true,
          with_vector: false,
          score_threshold: config.similarity_threshold
        });

        const threshold = config.similarity_threshold;
        const candidates: RetrievalCandidate[] = [];

        for (const p of points) {
          const score = p.score;
          if (typeof score !== "number") {
            continue;
          }

          // 兜底过滤，避免服务端/SDK 行为差异导致漏过滤
          if (score < threshold) {
            continue;
          }

          const payload = tryParseChunkPayload(p.payload);
          if (!payload) {
            log.warn("检索结果 payload 不完整，已跳过", {
              details: { collection, id: normalizePointId(p.id) }
            });
            continue;
          }

          candidates.push({
            chunk_id: normalizePointId(p.id),
            score,
            payload
          });
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates;
      } catch (error) {
        throw new QdrantError("Qdrant search 失败", {
          cause: error,
          details: {
            collection,
            top_k: config.top_k,
            similarity_threshold: config.similarity_threshold
          }
        });
      }
    }
  };
}

