import { stat } from "node:fs/promises";
import path from "node:path";
import type { QdrantClient } from "@qdrant/js-client-rest";
import { ValidationError } from "../common/errors";
import { createLogger } from "../common/logger";
import type { LedgerStore } from "../store/ledger";
import type { VectorRepository } from "../store/vector-repository";
import type { Embedder } from "./embedder";
import type { AppConfig } from "../config/types";
import type { DocumentIndexRow, ScannedFile, SupportedFileType } from "./types";
import { hashFileContent } from "./hash";
import { executeIndexPlan, indexDocument } from "./index-document";
import { scanSourceFiles } from "./file-scanner";
import { buildIndexPlan, hashScannedFiles } from "./index-state-machine";

const log = createLogger("reindex");

function extensionToFileType(extension: string): SupportedFileType {
  const ext = extension.toLowerCase();
  if (ext === ".md" || ext === ".markdown") {
    return "markdown";
  }
  if (ext === ".txt") {
    return "text";
  }
  throw new ValidationError(`不支持的扩展名: ${extension}`, {
    details: { extension }
  });
}

/** 根据绝对路径构造 {@link ScannedFile}（与 {@link scanSourceFiles} 字段语义对齐） */
export function resolveScannedFile(config: AppConfig, absolutePath: string): ScannedFile {
  const resolved = path.resolve(absolutePath);
  const extRaw = path.extname(resolved);
  const dotExt = extRaw.startsWith(".") ? extRaw.toLowerCase() : `.${extRaw.toLowerCase()}`;
  const file_type = extensionToFileType(dotExt);

  let best: { root: string; name: string } | undefined;
  for (const s of config.sources) {
    const root = path.resolve(s.path);
    if (resolved.startsWith(root + path.sep) || resolved === root) {
      if (!best || root.length > best.root.length) {
        best = { root, name: s.name };
      }
    }
  }

  if (best) {
    const rel = path.relative(best.root, resolved).split(path.sep).join("/");
    return {
      source_name: best.name,
      source_root: best.root,
      source_path: resolved,
      relative_path: rel,
      extension: dotExt,
      file_type
    };
  }

  return {
    source_name: "unknown",
    source_root: path.dirname(resolved),
    source_path: resolved,
    relative_path: path.basename(resolved),
    extension: dotExt,
    file_type
  };
}

/**
 * 按台账行重跑索引：文件不存在则标记 failed；否则走既有 {@link indexDocument}。
 * `triggered` 仅统计实际发起 index 尝试的次数（不含「文件缺失」）。
 */
export async function reindexLedgerRows(
  config: AppConfig,
  ledger: LedgerStore,
  vectorRepo: VectorRepository,
  embedder: Embedder,
  rows: DocumentIndexRow[]
): Promise<{ triggered: number; failed: number }> {
  let triggered = 0;
  let failed = 0;

  for (const row of rows) {
    const abs = row.source_path;

    try {
      const st = await stat(abs);
      if (!st.isFile()) {
        ledger.upsertDocument({
          source_path: abs,
          doc_id: row.doc_id ?? null,
          status: "failed",
          content_hash: row.content_hash ?? null,
          chunk_ids: row.chunk_ids ?? null,
          error_msg: "路径不是常规文件",
          indexed_at: row.indexed_at ?? null
        });
        failed++;
        continue;
      }
    } catch {
      ledger.upsertDocument({
        source_path: abs,
        doc_id: row.doc_id ?? null,
        status: "failed",
        content_hash: row.content_hash ?? null,
        chunk_ids: row.chunk_ids ?? null,
        error_msg: "文件已不存在",
        indexed_at: row.indexed_at ?? null
      });
      failed++;
      continue;
    }

    try {
      const scanned = resolveScannedFile(config, abs);
      const hash = await hashFileContent(abs);
      triggered++;
      await indexDocument(config, ledger, vectorRepo, embedder, scanned, hash, { previousRecord: row });
    } catch (error) {
      failed++;
      log.warn("重索引条目失败", { cause: error, details: { source_path: abs } });
    }
  }

  return { triggered, failed };
}

export interface FullResetReindexResult {
  mode: "full_reset";
  scanned: number;
  triggered: number;
  failed: number;
}

export async function fullResetReindex(
  config: AppConfig,
  ledger: LedgerStore,
  vectorRepo: VectorRepository,
  embedder: Embedder,
  qdrantClient: QdrantClient
): Promise<FullResetReindexResult> {
  const exists = await qdrantClient.collectionExists(config.qdrant_collection_name);
  if (exists.exists) {
    log.info("清空 Qdrant collection", {
      details: { collection: config.qdrant_collection_name }
    });
    await qdrantClient.deleteCollection(config.qdrant_collection_name);
  }

  await ledger.ensureSchema();
  ledger.clearDocuments();

  const scanned = await scanSourceFiles(config);
  const hashes = await hashScannedFiles(scanned);
  const plan = await buildIndexPlan(ledger, scanned, hashes);

  await executeIndexPlan(config, ledger, vectorRepo, embedder, scanned, hashes, plan);

  const rows = ledger.listDocuments();
  return {
    mode: "full_reset",
    scanned: scanned.length,
    triggered: plan.filter((p) => p.action === "add" || p.action === "update").length,
    failed: rows.filter((r) => r.status === "failed").length
  };
}
