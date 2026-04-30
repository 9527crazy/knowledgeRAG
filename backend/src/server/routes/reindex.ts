import type { QdrantClient } from "@qdrant/js-client-rest";
import { ValidationError } from "../../common/errors";
import { summarizeError } from "../../common/error-utils";
import type { AppConfig } from "../../config/types";
import type { Embedder } from "../../ingest/embedder";
import { fullResetReindex, reindexLedgerRows } from "../../ingest/reindex";
import type { LedgerStore } from "../../store/ledger";
import type { VectorRepository } from "../../store/vector-repository";

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

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (error) {
    throw new ValidationError("请求体必须是合法 JSON", { cause: error });
  }
}

export interface ReindexRouteDeps {
  config: AppConfig;
  ledger: LedgerStore;
  vectorRepo: VectorRepository;
  embedder: Embedder;
  qdrantClient: QdrantClient;
}

export async function handleReindexRequest(req: Request, deps: ReindexRouteDeps): Promise<Response> {
  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "只支持 POST");
  }

  try {
    const body = await parseJsonBody(req);

    let doc_id: unknown;
    let mode: unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      doc_id = (body as { doc_id?: unknown }).doc_id;
      mode = (body as { mode?: unknown }).mode;
    }

    if (mode !== undefined && mode !== null && mode !== "full_reset") {
      throw new ValidationError("mode 仅支持 full_reset");
    }

    if (doc_id !== undefined && doc_id !== null) {
      if (typeof doc_id !== "string") {
        throw new ValidationError("doc_id 必须是 string");
      }
      const trimmed = doc_id.trim();
      if (trimmed.length === 0) {
        throw new ValidationError("doc_id 不能为空");
      }
    }

    if (mode === "full_reset") {
      const result = await fullResetReindex(deps.config, deps.ledger, deps.vectorRepo, deps.embedder, deps.qdrantClient);
      return Response.json(result);
    }

    await deps.ledger.ensureSchema();
    const rows = deps.ledger.listDocuments();

    let targets;
    if (typeof doc_id === "string" && doc_id.trim().length > 0) {
      const id = doc_id.trim();
      targets = rows.filter((r) => r.doc_id === id);
    } else {
      targets = rows.filter((r) => r.status === "failed");
    }

    const result = await reindexLedgerRows(deps.config, deps.ledger, deps.vectorRepo, deps.embedder, targets);

    return Response.json({
      triggered: result.triggered,
      failed: result.failed
    });
  } catch (error) {
    const summary = summarizeError(error, "BAD_REQUEST");
    const status = summary.code === "VALIDATION_ERROR" ? 400 : 500;
    return jsonError(status, summary.code, summary.message, summary.details);
  }
}
