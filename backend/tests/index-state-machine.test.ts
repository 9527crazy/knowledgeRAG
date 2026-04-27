import { describe, expect, test } from "bun:test";
import { ValidationError } from "../src/common/errors";
import type { LedgerStore } from "../src/store/ledger";
import { buildIndexPlan } from "../src/ingest/index-state-machine";
import type { DocumentIndexRow, ScannedFile } from "../src/ingest/types";

function file(path: string): ScannedFile {
  return {
    source_name: "t",
    source_root: "/r",
    source_path: path,
    relative_path: path.split("/").pop() ?? path,
    extension: ".md",
    file_type: "markdown"
  };
}

function createMemoryLedger(rows: DocumentIndexRow[]): LedgerStore & { rows: DocumentIndexRow[] } {
  const store = { rows: [...rows] };
  return {
    rows: store.rows,
    async ensureSchema(): Promise<{ ok: boolean; path: string; table: string }> {
      return { ok: true, path: ":memory:", table: "document_index" };
    },
    async getSchemaStatus(): Promise<{ ok: boolean; path: string; table: string }> {
      return { ok: true, path: ":memory:", table: "document_index" };
    },
    getBySourcePath(source_path: string): DocumentIndexRow | undefined {
      return store.rows.find((r) => r.source_path === source_path);
    },
    listDocuments(): DocumentIndexRow[] {
      return [...store.rows].sort((a, b) => a.source_path.localeCompare(b.source_path));
    },
    upsertDocument(): void {},
    deleteBySourcePath(): void {},
    close(): void {}
  };
}

describe("buildIndexPlan", () => {
  test("新文件 → add", async () => {
    const ledger = createMemoryLedger([]);
    const scanned = [file("/a/x.md")];
    const hashes = new Map<string, string>([["/a/x.md", "h1"]]);
    const plan = await buildIndexPlan(ledger, scanned, hashes);
    expect(plan).toEqual([
      expect.objectContaining({ action: "add", source_path: "/a/x.md", content_hash: "h1" })
    ]);
  });

  test("hash 未变 → skip（可带 doc_id）", async () => {
    const ledger = createMemoryLedger([
      {
        source_path: "/a/x.md",
        doc_id: "doc_1",
        content_hash: "h1",
        chunk_ids: "[]",
        status: "done",
        error_msg: null,
        indexed_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z"
      }
    ]);
    const scanned = [file("/a/x.md")];
    const hashes = new Map<string, string>([["/a/x.md", "h1"]]);
    const plan = await buildIndexPlan(ledger, scanned, hashes);
    expect(plan[0]).toMatchObject({ action: "skip", doc_id: "doc_1" });
  });

  test("hash 变化 → update（含 previousRecord）", async () => {
    const prev: DocumentIndexRow = {
      source_path: "/a/x.md",
      doc_id: "doc_1",
      content_hash: "old",
      chunk_ids: "[]",
      status: "done",
      error_msg: null,
      indexed_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z"
    };
    const ledger = createMemoryLedger([prev]);
    const scanned = [file("/a/x.md")];
    const hashes = new Map<string, string>([["/a/x.md", "new"]]);
    const plan = await buildIndexPlan(ledger, scanned, hashes);
    expect(plan[0]).toMatchObject({ action: "update", content_hash: "new", previousRecord: prev });
  });

  test("台账有、扫描无 → remove", async () => {
    const ledger = createMemoryLedger([
      {
        source_path: "/gone.md",
        doc_id: null,
        content_hash: null,
        chunk_ids: null,
        status: "done",
        error_msg: null,
        indexed_at: null,
        updated_at: "2020-01-01T00:00:00.000Z"
      }
    ]);
    const scanned = [file("/still.md")];
    const hashes = new Map<string, string>([["/still.md", "h"]]);
    const plan = await buildIndexPlan(ledger, scanned, hashes);
    const removes = plan.filter((p) => p.action === "remove");
    expect(removes.length).toBe(1);
    expect(removes[0]!.source_path).toBe("/gone.md");
  });

  test("缺少 hash → ValidationError", async () => {
    const ledger = createMemoryLedger([]);
    const scanned = [file("/a/x.md")];
    const hashes = new Map<string, string>();
    await expect(buildIndexPlan(ledger, scanned, hashes)).rejects.toThrow(ValidationError);
  });
});
