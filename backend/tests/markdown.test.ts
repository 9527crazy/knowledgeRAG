import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "../src/ingest/parsers/markdown";
import type { ScannedFile } from "../src/ingest/types";

function scan(rel: string, abs = "/knowledge/" + rel): ScannedFile {
  return {
    source_name: "k",
    source_root: "/knowledge",
    source_path: abs,
    relative_path: rel,
    extension: ".md",
    file_type: "markdown"
  };
}

describe("parseMarkdown", () => {
  test("无 ATX 标题：doc_title 为去扩展名基名，单节且 section_title 为空", () => {
    const s = scan("notes/hello.md", "/knowledge/notes/hello.md");
    const doc = parseMarkdown(s, "一段无标题正文。\n第二行。", "id1");
    expect(doc.doc_title).toBe("hello");
    expect(doc.sections.length).toBe(1);
    expect(doc.sections[0]!.section_title).toBe("");
    expect(doc.sections[0]!.content).toBe("一段无标题正文。\n第二行。");
  });

  test("标题前正文入默认节，H1 后节带标题路径", () => {
    const doc = parseMarkdown(scan("x.md"), "先导段落。\n\n# 主章\n正文A。\n\n## 小节\n正文B。", "id2");
    expect(doc.sections.length).toBe(3);
    expect(doc.sections[0]!.section_title).toBe("");
    expect(doc.sections[0]!.content.trimStart()).toMatch(/^先导段落/);
    expect(doc.sections[1]!.section_title).toContain("主章");
    expect(doc.sections[1]!.content).toContain("# 主章");
  });

  test("多级标题：层级回退时截断栈，section_title 含目录前缀", () => {
    const s = scan("proj/readme.md", "/root/proj/readme.md");
    const text = ["# Root", "", "## A", "", "### A1", "内文"].join("\n");
    const doc = parseMarkdown(s, text, "id3");
    const titles = doc.sections.map((x) => x.section_title).filter(Boolean);
    expect(titles.some((t) => t.includes("proj"))).toBe(true);
    expect(titles.some((t) => t.endsWith("Root/A/A1"))).toBe(true);
  });

  test("多个 H1：doc_title 取首个一级标题", () => {
    const doc = parseMarkdown(scan("m.md"), "# First\n\n# Second\nbody", "id4");
    expect(doc.doc_title).toBe("First");
  });
});
