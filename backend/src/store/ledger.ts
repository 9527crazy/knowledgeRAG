import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { AppConfig } from "../config/types";
import { LedgerError } from "../common/errors";

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

export interface LedgerStore {
  ensureSchema(): Promise<LedgerStatus>;
  getSchemaStatus(): Promise<LedgerStatus>;
  close(): void;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
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
    close(): void {
      if (db) {
        db.close();
        db = undefined;
      }
    }
  };
}
