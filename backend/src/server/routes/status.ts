import path from "node:path";
import type { QdrantClient } from "@qdrant/js-client-rest";
import type { AppConfig } from "../../config/types";
import { createLogger } from "../../common/logger";
import type { LedgerStore } from "../../store/ledger";

const log = createLogger("route-status");

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

export interface StatusRouteDeps {
  config: AppConfig;
  ledger: LedgerStore;
  qdrantClient: QdrantClient;
}

export async function handleStatusRequest(req: Request, deps: StatusRouteDeps): Promise<Response> {
  if (req.method !== "GET") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "只支持 GET");
  }

  await deps.ledger.ensureSchema();
  const rows = deps.ledger.listDocuments();

  let total_chunks = 0;
  try {
    const info = await deps.qdrantClient.getCollection(deps.config.qdrant_collection_name);
    total_chunks = info.points_count ?? 0;
  } catch (cause) {
    log.warn("读取 Qdrant collection 信息失败，total_chunks 置 0", { cause });
  }

  const total_docs = rows.filter((r) => r.status === "done").length;
  const failed_docs = rows.filter((r) => r.status === "failed").length;
  const indexing_docs = rows.filter((r) => r.status === "indexing").length;

  const doneWithTime = rows.filter((r) => r.status === "done" && r.indexed_at != null && r.indexed_at.length > 0);
  let last_indexed_at: string | null = null;
  for (const r of doneWithTime) {
    const t = r.indexed_at!;
    if (last_indexed_at === null || t > last_indexed_at) {
      last_indexed_at = t;
    }
  }

  const sources = deps.config.sources.map((src) => {
    const root = path.resolve(src.path);
    const doc_count = rows.filter((r) => r.source_path.startsWith(root + path.sep) || r.source_path === root).length;
    return { name: src.name, path: root, doc_count };
  });

  return Response.json({
    total_docs,
    total_chunks,
    failed_docs,
    indexing_docs,
    last_indexed_at,
    sources
  });
}
