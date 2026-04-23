import type { AppConfig } from "../config/types";
import { createLogger } from "../common/logger";
import type { LedgerStore } from "../store/ledger";
import { createQdrantStore } from "../store/qdrant";
import type { ChunkPayload, VectorPoint, VectorRepository } from "../store/vector-repository";
import type { Embedder } from "./embedder";
import { chunkDocument } from "./chunker";
import { parseScannedFile } from "./parse";
import type { DocumentIndexRow, IndexPlanEntry, ParsedDocument, ScannedFile, SupportedFileType, TextChunk } from "./types";

const log = createLogger("index-document");

function truncateMessage(message: string, max = 4000): string {
  return message.length <= max ? message : `${message.slice(0, max)}…`;
}

function docTypeLabel(fileType: SupportedFileType): string {
  return fileType === "markdown" ? "md" : "txt";
}

export function buildChunkPayload(
  parsed: ParsedDocument,
  chunk: TextChunk,
  sourceName: string,
  totalChunks: number,
  indexedAtMs: number
): ChunkPayload {
  return {
    doc_id: parsed.doc_id,
    source_path: parsed.source_path,
    source_name: sourceName,
    doc_title: parsed.doc_title,
    doc_type: docTypeLabel(parsed.file_type),
    section_title: chunk.section_title,
    chunk_text: chunk.chunk_text,
    chunk_index: chunk.chunk_index,
    total_chunks: totalChunks,
    char_count: chunk.chunk_text.length,
    indexed_at: indexedAtMs
  };
}

export function parseChunkIdsFromRecord(row: DocumentIndexRow | undefined): string[] {
  const raw = row?.chunk_ids;
  if (!raw) {
    return [];
  }
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface IndexDocumentOptions {
  previousRecord?: DocumentIndexRow;
}

/**
 * 单文档完整入库：解析 → 切块 →（更新则删旧点）→ 串行 Embedding → Qdrant upsert → 台账 `done`。
 * 失败时台账 `failed` 并抛出最后一个错误。
 */
export async function indexDocument(
  config: AppConfig,
  ledger: LedgerStore,
  vectorRepo: VectorRepository,
  embedder: Embedder,
  file: ScannedFile,
  contentHash: string,
  options: IndexDocumentOptions = {}
): Promise<void> {
  await createQdrantStore(config).ensureCollection();

  let parsed: ParsedDocument;
  try {
    parsed = await parseScannedFile(file);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ledger.upsertDocument({
      source_path: file.source_path,
      status: "failed",
      error_msg: truncateMessage(`解析失败: ${msg}`),
      content_hash: contentHash,
      indexed_at: new Date().toISOString()
    });
    throw error;
  }

  ledger.upsertDocument({
    source_path: parsed.source_path,
    doc_id: parsed.doc_id,
    content_hash: contentHash,
    status: "indexing",
    chunk_ids: null,
    error_msg: null,
    indexed_at: new Date().toISOString()
  });

  const chunks = chunkDocument(parsed, config);

  const oldIds = parseChunkIdsFromRecord(options.previousRecord);
  if (oldIds.length > 0) {
    await vectorRepo.deleteByChunkIds(oldIds);
  }

  if (chunks.length === 0) {
    ledger.upsertDocument({
      source_path: parsed.source_path,
      doc_id: parsed.doc_id,
      content_hash: contentHash,
      chunk_ids: "[]",
      status: "done",
      error_msg: null,
      indexed_at: new Date().toISOString()
    });
    log.info("indexDocument 完成（无有效 chunk，仅台账）", {
      details: { source_path: parsed.source_path }
    });
    return;
  }

  const indexedAtMs = Date.now();
  const points: VectorPoint[] = [];

  try {
    for (const chunk of chunks) {
      const vector = await embedder.embed(chunk.chunk_text);
      points.push({
        id: chunk.chunk_id,
        vector,
        payload: buildChunkPayload(parsed, chunk, file.source_name, chunks.length, indexedAtMs)
      });
    }

    await vectorRepo.upsertChunks(points);

    ledger.upsertDocument({
      source_path: parsed.source_path,
      doc_id: parsed.doc_id,
      content_hash: contentHash,
      chunk_ids: JSON.stringify(chunks.map((c) => c.chunk_id)),
      status: "done",
      error_msg: null,
      indexed_at: new Date().toISOString()
    });

    log.info("indexDocument 已向量化并写入 Qdrant", {
      details: {
        source_path: parsed.source_path,
        chunk_count: chunks.length
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ledger.upsertDocument({
      source_path: parsed.source_path,
      doc_id: parsed.doc_id,
      content_hash: contentHash,
      status: "failed",
      error_msg: truncateMessage(msg),
      indexed_at: new Date().toISOString()
    });
    throw error;
  }
}

/** 删除路径：删向量点并删台账行 */
export async function removeDocument(
  config: AppConfig,
  ledger: LedgerStore,
  vectorRepo: VectorRepository,
  entry: IndexPlanEntry
): Promise<void> {
  if (entry.action !== "remove") {
    return;
  }

  await createQdrantStore(config).ensureCollection();

  const row = entry.previousRecord;
  const ids = parseChunkIdsFromRecord(row);
  if (ids.length > 0) {
    await vectorRepo.deleteByChunkIds(ids);
  }

  ledger.deleteBySourcePath(entry.source_path);
  log.info("removeDocument 已删除向量与台账", {
    details: { source_path: entry.source_path, removed_points: ids.length }
  });
}

/**
 * 执行一轮增量计划：`remove` 优先，再处理 `add`/`update`，`skip` 跳过。
 */
export async function executeIndexPlan(
  config: AppConfig,
  ledger: LedgerStore,
  vectorRepo: VectorRepository,
  embedder: Embedder,
  scannedFiles: ScannedFile[],
  hashes: ReadonlyMap<string, string>,
  plan: IndexPlanEntry[]
): Promise<void> {
  await createQdrantStore(config).ensureCollection();
  await ledger.ensureSchema();

  const fileByPath = new Map(scannedFiles.map((f) => [f.source_path, f] as const));

  const removals = plan.filter((p) => p.action === "remove");
  const rest = plan.filter((p) => p.action !== "remove");

  for (const entry of removals) {
    await removeDocument(config, ledger, vectorRepo, entry);
  }

  for (const entry of rest) {
    if (entry.action === "skip") {
      continue;
    }

    const file = fileByPath.get(entry.source_path);
    const hash = hashes.get(entry.source_path);
    if (!file || hash === undefined) {
      log.warn("计划中缺少扫描文件或 hash，跳过", {
        details: { source_path: entry.source_path, action: entry.action }
      });
      continue;
    }

    const docOptions: IndexDocumentOptions =
      entry.action === "update" && entry.previousRecord !== undefined
        ? { previousRecord: entry.previousRecord }
        : {};

    await indexDocument(config, ledger, vectorRepo, embedder, file, hash, docOptions);
  }
}
