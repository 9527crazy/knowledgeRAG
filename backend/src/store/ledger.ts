import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { AppConfig } from "../config/types";
import { LedgerError } from "../common/errors";
import type { DocumentIndexRow } from "../ingest/types";

const DOCUMENT_INDEX_DDL = `
CREATE TABLE IF NOT EXISTS document_index (
  source_path TEXT PRIMARY KEY,
  doc_id TEXT,
  content_hash TEXT,
  chunk_ids TEXT,
  status TEXT NOT NULL,
  error_msg TEXT,
  indexed_at TEXT,
  updated_at TEXT NOT NULL
);
`;

export interface LedgerStatus {
  ok: boolean;
  path: string;
  table: string;
  table_exists?: boolean;
}

export interface UpsertDocumentInput {
  source_path: string;
  doc_id?: string | null;
  content_hash?: string | null;
  chunk_ids?: string | null;
  status: string;
  error_msg?: string | null;
  indexed_at?: string | null;
}

export interface LedgerStore {
  ensureSchema(): Promise<LedgerStatus>;
  getSchemaStatus(): Promise<LedgerStatus>;
  getBySourcePath(source_path: string): DocumentIndexRow | undefined;
  listDocuments(): DocumentIndexRow[];
  upsertDocument(input: UpsertDocumentInput): void;
  deleteBySourcePath(source_path: string): void;
  close(): void;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function mapRow(row: Record<string, unknown>): DocumentIndexRow {
  return {
    source_path: String(row.source_path),
    doc_id: row.doc_id != null ? String(row.doc_id) : null,
    content_hash: row.content_hash != null ? String(row.content_hash) : null,
    chunk_ids: row.chunk_ids != null ? String(row.chunk_ids) : null,
    status: String(row.status),
    error_msg: row.error_msg != null ? String(row.error_msg) : null,
    indexed_at: row.indexed_at != null ? String(row.indexed_at) : null,
    updated_at: String(row.updated_at)
  };
}

export function createLedgerStore(config: AppConfig): LedgerStore {
  let db: Database | undefined;

  function getDatabase(): Database {
    if (!db) {
      db = new Database(config.ledger_path, { create: true, strict: true });
    }

    return db;
  }

  async function getSchemaStatus(): Promise<LedgerStatus> {
    await ensureParentDirectory(config.ledger_path);
    const database = getDatabase();

    try {
      const row = database
        .query<{ name: string }, [string]>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get("document_index");

      return {
        ok: Boolean(row),
        path: config.ledger_path,
        table: "document_index",
        table_exists: Boolean(row)
      };
    } catch (error) {
      throw new LedgerError("读取 SQLite 台账状态失败", {
        cause: error,
        details: {
          ledger_path: config.ledger_path
        }
      });
    }
  }

  return {
    async ensureSchema(): Promise<LedgerStatus> {
      await ensureParentDirectory(config.ledger_path);
      const database = getDatabase();

      try {
        database.run(DOCUMENT_INDEX_DDL);
        return await getSchemaStatus();
      } catch (error) {
        throw new LedgerError("初始化 SQLite 台账表失败", {
          cause: error,
          details: {
            ledger_path: config.ledger_path,
            table: "document_index"
          }
        });
      }
    },
    getSchemaStatus,
    getBySourcePath(source_path: string): DocumentIndexRow | undefined {
      const database = getDatabase();
      const row = database
        .query<Record<string, unknown>, [string]>(
          "SELECT source_path, doc_id, content_hash, chunk_ids, status, error_msg, indexed_at, updated_at FROM document_index WHERE source_path = ?"
        )
        .get(source_path);
      return row ? mapRow(row) : undefined;
    },
    listDocuments(): DocumentIndexRow[] {
      const database = getDatabase();
      const rows = database
        .query<Record<string, unknown>, []>(
          "SELECT source_path, doc_id, content_hash, chunk_ids, status, error_msg, indexed_at, updated_at FROM document_index ORDER BY source_path"
        )
        .all();
      return rows.map(mapRow);
    },
    upsertDocument(input: UpsertDocumentInput): void {
      const database = getDatabase();
      const now = new Date().toISOString();
      const updated_at = now;
      const indexed_at = input.indexed_at ?? now;

      database.run(
        `INSERT INTO document_index (source_path, doc_id, content_hash, chunk_ids, status, error_msg, indexed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_path) DO UPDATE SET
           doc_id = excluded.doc_id,
           content_hash = excluded.content_hash,
           chunk_ids = excluded.chunk_ids,
           status = excluded.status,
           error_msg = excluded.error_msg,
           indexed_at = excluded.indexed_at,
           updated_at = excluded.updated_at`,
        [
          input.source_path,
          input.doc_id ?? null,
          input.content_hash ?? null,
          input.chunk_ids ?? null,
          input.status,
          input.error_msg ?? null,
          indexed_at,
          updated_at
        ]
      );
    },
    deleteBySourcePath(source_path: string): void {
      const database = getDatabase();
      database.run("DELETE FROM document_index WHERE source_path = ?", [source_path]);
    },
    close(): void {
      if (db) {
        db.close();
        db = undefined;
      }
    }
  };
}
