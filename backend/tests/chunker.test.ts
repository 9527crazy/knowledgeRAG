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

function originalBody(chunkText: string): string {
  return chunkText.split("原文：\n")[1] ?? chunkText;
}

describe("chunkDocument", () => {
  test("单节短文本：一节一块，section_title 对齐", () => {
    const parsed = baseDoc([{ section_title: "概述", content: "只有一行正文。", order: 0 }]);
    const chunks = chunkDocument(parsed, { chunk_size: 200, chunk_overlap: 0, min_chunk_length: 1 });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.section_title).toBe("概述");
    expect(chunks[0]!.chunk_text).toContain("文档标题：t");
    expect(chunks[0]!.chunk_text).toContain("文件名：a.md");
    expect(chunks[0]!.chunk_text).toContain("相对路径：a.md");
    expect(chunks[0]!.chunk_text).toContain("章节标题：概述");
    expect(chunks[0]!.chunk_text).toContain("原文：\n只有一行正文。");
    expect(chunks[0]!.chunk_index).toBe(0);
  });

  test("上下文头：缺失字段不输出空行，doc_title 缺失时用文件名兜底", () => {
    const parsed: ParsedDocument = {
      ...baseDoc([{ section_title: "", content: "正文。", order: 0 }]),
      doc_title: "",
      relative_path: ""
    };
    const chunks = chunkDocument(parsed, { chunk_size: 200, chunk_overlap: 0, min_chunk_length: 1 });
    const text = chunks[0]!.chunk_text;
    expect(text).toContain("文档标题：a.md");
    expect(text).toContain("文件名：a.md");
    expect(text).not.toContain("相对路径：");
    expect(text).not.toContain("章节标题：");
    expect(text).toContain("原文：\n正文。");
  });

  test("长文本 overlap：后一块起始位置落在此前一块结束之前", () => {
    const body = Array.from({ length: 120 }, (_, i) => `第${i}行内容略长以便切块。`).join("");
    const parsed = baseDoc([{ section_title: "长文", content: body, order: 0 }]);
    const chunks = chunkDocument(parsed, { chunk_size: 140, chunk_overlap: 24, min_chunk_length: 8 });
    expect(chunks.length).toBeGreaterThan(1);
    let prevEnd = 0;
    for (let i = 0; i < chunks.length; i++) {
      const t = originalBody(chunks[i]!.chunk_text);
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
    expect(kept[0]!.chunk_text).toContain("原文：\n一二三四五");
  });

  test("无可软切分点时硬切仍能前进", () => {
    const raw = "a".repeat(250);
    const parsed = baseDoc([{ section_title: "硬切", content: raw, order: 0 }]);
    const chunks = chunkDocument(parsed, { chunk_size: 80, chunk_overlap: 10, min_chunk_length: 1 });
    expect(chunks.length).toBeGreaterThan(2);
    let pos = 0;
    for (const c of chunks) {
      const body = originalBody(c.chunk_text);
      expect(body.length).toBeGreaterThan(0);
      expect(raw.slice(pos).startsWith(body) || raw.includes(body)).toBe(true);
      pos += body.length - Math.min(10, body.length);
    }
  });
});
