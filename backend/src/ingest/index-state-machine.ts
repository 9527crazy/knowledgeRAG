import type { LedgerStore } from "../store/ledger";
import { ValidationError } from "../common/errors";
import { hashFileContent } from "./hash";
import type { IndexPlanEntry, ParsedDocument, ScannedFile, TextChunk } from "./types";

/**
 * 台账 `status = done`：
 * - 仅执行第 4 天 `persistIndexedDocument`（无向量）时：表示切块与 hash 已落库；
 * - 经第 5 天 `indexDocument` 成功后：表示已向量化并写入 Qdrant（与 chunk_ids 一致）。
 */

/** 对扫描到的文件批量计算 MD5（路径 → hex） */
export async function hashScannedFiles(scannedFiles: ScannedFile[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const file of scannedFiles) {
    map.set(file.source_path, await hashFileContent(file.source_path));
  }
  return map;
}

/**
 * 对比当前扫描集与 SQLite 台账，生成增量计划（不含 Embedding/Qdrant）。
 * `hashes` 须包含每个 `scannedFiles[].source_path`。
 */
export async function buildIndexPlan(
  ledger: LedgerStore,
  scannedFiles: ScannedFile[],
  hashes: ReadonlyMap<string, string>
): Promise<IndexPlanEntry[]> {
  await ledger.ensureSchema();

  const scannedPaths = new Set<string>();
  const entries: IndexPlanEntry[] = [];

  for (const file of scannedFiles) {
    scannedPaths.add(file.source_path);
    const hash = hashes.get(file.source_path);
    if (hash === undefined) {
      throw new ValidationError("增量索引缺少文件 hash", {
        details: { source_path: file.source_path }
      });
    }

    const row = ledger.getBySourcePath(file.source_path);

    if (!row) {
      entries.push({
        action: "add",
        source_path: file.source_path,
        content_hash: hash
      });
      continue;
    }

    const prev = row.content_hash ?? "";
    if (prev === hash) {
      const skipEntry: IndexPlanEntry = {
        action: "skip",
        source_path: file.source_path,
        content_hash: hash
      };
      if (row.doc_id != null) {
        skipEntry.doc_id = row.doc_id;
      }
      entries.push(skipEntry);
      continue;
    }

    const updateEntry: IndexPlanEntry = {
      action: "update",
      source_path: file.source_path,
      content_hash: hash,
      previousRecord: row
    };
    if (row.doc_id != null) {
      updateEntry.doc_id = row.doc_id;
    }
    entries.push(updateEntry);
  }

  const existing = ledger.listDocuments();
  for (const row of existing) {
    if (!scannedPaths.has(row.source_path)) {
      entries.push({
        action: "remove",
        source_path: row.source_path,
        previousRecord: row
      });
    }
  }

  return entries;
}

/** 将解析与切块结果写入台账（供 add/update 验收或 demo） */
export function persistIndexedDocument(
  ledger: LedgerStore,
  parsed: ParsedDocument,
  contentHash: string,
  chunks: TextChunk[]
): void {
  ledger.upsertDocument({
    source_path: parsed.source_path,
    doc_id: parsed.doc_id,
    content_hash: contentHash,
    chunk_ids: JSON.stringify(chunks.map((c) => c.chunk_id)),
    status: "done",
    error_msg: null,
    indexed_at: new Date().toISOString()
  });
}
