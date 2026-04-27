import { describe, expect, test } from "bun:test";
import { chunkDocument } from "../src/ingest/chunker";
import type { ParsedDocument } from "../src/ingest/types";

function baseDoc(sections: ParsedDocument["sections"]): ParsedDocument {
  return {
    doc_id: "doc_test",
    doc_title: "t",
    source_name: "s",
    source_path: "/tmp/a.md",
    relative_path: "a.md",
    file_type: "markdown",
    sections
  };
}

describe("chunkDocument", () => {
  test("单节短文本：一节一块，section_title 对齐", () => {
    const parsed = baseDoc([{ section_title: "概述", content: "只有一行正文。", order: 0 }]);
    const chunks = chunkDocument(parsed, { chunk_size: 200, chunk_overlap: 0, min_chunk_length: 1 });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.section_title).toBe("概述");
    expect(chunks[0]!.chunk_text).toBe("只有一行正文。");
    expect(chunks[0]!.chunk_index).toBe(0);
  });

  test("长文本 overlap：后一块起始位置落在此前一块结束之前", () => {
    const body = Array.from({ length: 120 }, (_, i) => `第${i}行内容略长以便切块。`).join("");
    const parsed = baseDoc([{ section_title: "长文", content: body, order: 0 }]);
    const chunks = chunkDocument(parsed, { chunk_size: 140, chunk_overlap: 24, min_chunk_length: 8 });
    expect(chunks.length).toBeGreaterThan(1);
    let prevEnd = 0;
    for (let i = 0; i < chunks.length; i++) {
      const t = chunks[i]!.chunk_text;
      const from = i === 0 ? 0 : Math.max(0, prevEnd - 80);
      const idx = body.indexOf(t, from);
      expect(idx).not.toBe(-1);
      if (i > 0) {
        expect(idx).toBeLessThan(prevEnd);
      }
      prevEnd = idx + t.length;
    }
  });

  test("min_chunk_length：严格小于阈值丢弃，等于阈值保留", () => {
    const parsed = baseDoc([{ section_title: "", content: "一二三四五", order: 0 }]);
    const dropped = chunkDocument(parsed, { chunk_size: 100, chunk_overlap: 0, min_chunk_length: 6 });
    expect(dropped.length).toBe(0);

    const kept = chunkDocument(parsed, { chunk_size: 100, chunk_overlap: 0, min_chunk_length: 5 });
    expect(kept.length).toBe(1);
    expect(kept[0]!.chunk_text).toBe("一二三四五");
  });

  test("无可软切分点时硬切仍能前进", () => {
    const raw = "a".repeat(250);
    const parsed = baseDoc([{ section_title: "硬切", content: raw, order: 0 }]);
    const chunks = chunkDocument(parsed, { chunk_size: 80, chunk_overlap: 10, min_chunk_length: 1 });
    expect(chunks.length).toBeGreaterThan(2);
    let pos = 0;
    for (const c of chunks) {
      expect(c.chunk_text.length).toBeGreaterThan(0);
      expect(raw.slice(pos).startsWith(c.chunk_text) || raw.includes(c.chunk_text)).toBe(true);
      pos += c.chunk_text.length - Math.min(10, c.chunk_text.length);
    }
  });
});
