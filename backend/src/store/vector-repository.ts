import { QdrantClient } from "@qdrant/js-client-rest";
import type { AppConfig } from "../config/types";
import { QdrantError } from "../common/errors";
import { DEFAULT_QDRANT_URL } from "./qdrant";

/** 与需求 §7.1 对齐的 Payload（均为 Qdrant 可 JSON 序列化类型） */
export interface ChunkPayload {
  doc_id: string;
  source_path: string;
  source_name: string;
  doc_title: string;
  /** `md` | `txt` */
  doc_type: string;
  section_title: string;
  chunk_text: string;
  chunk_index: number;
  total_chunks: number;
  char_count: number;
  /** Unix 毫秒 */
  indexed_at: number;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}

export interface VectorRepository {
  upsertChunks(points: VectorPoint[]): Promise<void>;
  deleteByChunkIds(ids: string[]): Promise<void>;
}

export function createVectorRepository(config: AppConfig): VectorRepository {
  const client = new QdrantClient({ url: DEFAULT_QDRANT_URL, checkCompatibility: false });
  const collection = config.qdrant_collection_name;

  return {
    async upsertChunks(points: VectorPoint[]): Promise<void> {
      if (points.length === 0) {
        return;
      }

      try {
        await client.upsert(collection, {
          wait: true,
          points: points.map((p) => ({
            id: p.id,
            vector: p.vector,
            payload: {
              doc_id: p.payload.doc_id,
              source_path: p.payload.source_path,
              source_name: p.payload.source_name,
              doc_title: p.payload.doc_title,
              doc_type: p.payload.doc_type,
              section_title: p.payload.section_title,
              chunk_text: p.payload.chunk_text,
              chunk_index: p.payload.chunk_index,
              total_chunks: p.payload.total_chunks,
              char_count: p.payload.char_count,
              indexed_at: p.payload.indexed_at
            }
          }))
        });
      } catch (error) {
        throw new QdrantError("Qdrant upsert 失败", {
          cause: error,
          details: {
            collection,
            point_count: points.length
          }
        });
      }
    },

    async deleteByChunkIds(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }

      try {
        await client.delete(collection, {
          wait: true,
          points: ids
        });
      } catch (error) {
        throw new QdrantError("Qdrant 按 chunk id 删除失败", {
          cause: error,
          details: {
            collection,
            id_count: ids.length
          }
        });
      }
    }
  };
}
