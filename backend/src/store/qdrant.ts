import { mkdir } from "node:fs/promises";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { AppConfig } from "../config/types";
import { QdrantError } from "../common/errors";

const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";

export interface QdrantStatus {
  ok: boolean;
  url: string;
  local_path: string;
  collection: string;
  vector_size: number;
  collection_exists?: boolean;
  collection_created?: boolean;
}

export interface QdrantStore {
  ensureCollection(): Promise<QdrantStatus>;
  getStatus(): QdrantStatus;
}

export function createQdrantStore(config: AppConfig): QdrantStore {
  const url = DEFAULT_QDRANT_URL;
  const client = new QdrantClient({ url, checkCompatibility: false });
  const baseStatus: QdrantStatus = {
    ok: false,
    url,
    local_path: config.qdrant_path,
    collection: config.qdrant_collection_name,
    vector_size: config.embedding_dimensions
  };

  return {
    async ensureCollection(): Promise<QdrantStatus> {
      await mkdir(config.qdrant_path, { recursive: true });

      try {
        const existence = await client.collectionExists(config.qdrant_collection_name);

        if (!existence.exists) {
          await client.createCollection(config.qdrant_collection_name, {
            vectors: {
              size: config.embedding_dimensions,
              distance: "Cosine"
            }
          });

          return {
            ...baseStatus,
            ok: true,
            collection_exists: true,
            collection_created: true
          };
        }

        return {
          ...baseStatus,
          ok: true,
          collection_exists: true,
          collection_created: false
        };
      } catch (error) {
        throw new QdrantError("Qdrant collection 初始化失败", {
          cause: error,
          details: {
            url,
            qdrant_path: config.qdrant_path,
            collection: config.qdrant_collection_name,
            embedding_dimensions: config.embedding_dimensions,
            note: "当前实现使用官方 JS REST 客户端连接本地 Qdrant 实例；若本机未启动服务，该检查会失败。"
          }
        });
      }
    },
    getStatus(): QdrantStatus {
      return baseStatus;
    }
  };
}
