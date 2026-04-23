import path from "node:path";
import type { ParsedDocument, ParsedSection, ScannedFile } from "../types";

/** 仅识别行首 ATX `#`～`###`（其后至少一个空格） */
const ATX_HEADING = /^(#{1,3})\s+(.+?)\s*$/;

interface HeadingMark {
  index: number;
  level: 1 | 2 | 3;
  title: string;
}

function stripExtensionFromBasename(relativePosix: string): string {
  const base = path.posix.basename(relativePosix);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(0, dot) : base;
}

/** 来源相对路径的目录部分（POSIX），根下文件为 `""` */
function directoryPartOfRelative(relativePath: string): string {
  const posix = relativePath.replace(/\\/g, "/");
  const dir = path.posix.dirname(posix);
  if (dir === "." || dir === "") {
    return "";
  }
  return dir;
}

/** 含标题的节：目录段 + 标题栈，以 `/` 连接 */
function sectionTitleForHeadingBlock(dirPart: string, headingTrail: string[]): string {
  const dirSegments = dirPart ? dirPart.split("/").filter(Boolean) : [];
  return [...dirSegments, ...headingTrail].join("/");
}

function extractFirstH1Title(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    const m = line.match(/^(#)\s+(.+?)\s*$/);
    if (m && m[1]!.length === 1) {
      return m[2]!.trim();
    }
  }
  return undefined;
}

export function parseMarkdown(scanned: ScannedFile, text: string, doc_id: string): ParsedDocument {
  const relativePosix = scanned.relative_path.replace(/\\/g, "/");
  const dirPart = directoryPartOfRelative(relativePosix);
  const defaultTitle = stripExtensionFromBasename(relativePosix);

  const lines = text.split(/\r?\n/);
  const firstH1 = extractFirstH1Title(lines);
  const doc_title = firstH1 ?? defaultTitle;

  const headings: HeadingMark[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(ATX_HEADING);
    if (m) {
      const level = m[1]!.length as 1 | 2 | 3;
      headings.push({ index: i, level, title: m[2]!.trim() });
    }
  }

  const sections: ParsedSection[] = [];
  let order = 0;

  const pushSection = (section_title: string, content: string) => {
    if (content.trim().length === 0) {
      return;
    }
    sections.push({ section_title, content, order });
    order += 1;
  };

  if (headings.length === 0) {
    pushSection("", text);
    return {
      doc_id,
      doc_title,
      source_name: scanned.source_name,
      source_path: scanned.source_path,
      relative_path: scanned.relative_path,
      file_type: "markdown",
      sections
    };
  }

  // 标题前正文：默认节，section_title 固定为空串
  const firstIdx = headings[0]!.index;
  if (firstIdx > 0) {
    pushSection("", lines.slice(0, firstIdx).join("\n"));
  }

  const stackBuf: string[] = [];
  for (let k = 0; k < headings.length; k++) {
    const h = headings[k]!;
    stackBuf.length = h.level - 1;
    stackBuf[h.level - 1] = h.title;
    const trail = [...stackBuf];

    const start = h.index;
    const endExclusive = k + 1 < headings.length ? headings[k + 1]!.index : lines.length;
    const chunk = lines.slice(start, endExclusive).join("\n");
    const titlePath = sectionTitleForHeadingBlock(dirPart, trail);
    pushSection(titlePath, chunk);
  }

  return {
    doc_id,
    doc_title,
    source_name: scanned.source_name,
    source_path: scanned.source_path,
    relative_path: scanned.relative_path,
    file_type: "markdown",
    sections
  };
}
