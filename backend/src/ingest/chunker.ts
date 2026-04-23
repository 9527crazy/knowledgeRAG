import { randomUUID } from "node:crypto";
import type { ChunkOptions, ParsedDocument, ParsedSection, TextChunk } from "./types";

/**
 * 丢弃长度 **严格小于** `min_chunk_length` 的块；长度等于阈值时保留。
 *
 * 全文按 section `order` 排序后拼接，节与节之间插入 `\n\n`，再整体切块（overlap 可跨节）。
 * chunk 的 `section_title` 取该块起始字符偏移所在语义节：若落在节间分隔符缝隙，归属下一节。
 */

interface SectionLayout {
  sections: ParsedSection[];
  starts: number[];
  fullText: string;
}

function buildLayout(parsed: ParsedDocument): SectionLayout {
  const sections = [...parsed.sections].sort((a, b) => a.order - b.order);
  let fullText = "";
  const starts: number[] = [];

  for (let i = 0; i < sections.length; i++) {
    if (i > 0) {
      fullText += "\n\n";
    }
    starts.push(fullText.length);
    fullText += sections[i]!.content;
  }

  return { sections, starts, fullText };
}

/** 偏移 `pos` 落在哪一节标题（缝隙归下一节） */
function sectionTitleAt(pos: number, layout: SectionLayout): string {
  const { sections, starts } = layout;
  if (sections.length === 0) {
    return "";
  }

  for (let i = 0; i < sections.length; i++) {
    const secStart = starts[i]!;
    if (pos < secStart) {
      return sections[i]!.section_title;
    }
    const secEnd = secStart + sections[i]!.content.length;
    if (pos < secEnd) {
      return sections[i]!.section_title;
    }
  }

  return sections[sections.length - 1]!.section_title;
}

/** 在 [start, min(start+chunkSize, len)) 窗口内按优先级找切分点（不包含则硬切） */
function findCutEnd(fullText: string, start: number, chunkSize: number): number {
  const hardEnd = Math.min(start + chunkSize, fullText.length);
  if (hardEnd <= start + 1) {
    return hardEnd;
  }

  const slice = fullText.slice(start, hardEnd);
  const patterns = ["\n\n", "\n", "。", "！", "？"];

  for (const p of patterns) {
    let idx = slice.lastIndexOf(p);
    while (idx !== -1) {
      const cutEnd = start + idx + p.length;
      if (cutEnd > start && cutEnd <= hardEnd) {
        return cutEnd;
      }
      idx = idx === 0 ? -1 : slice.lastIndexOf(p, idx - 1);
    }
  }

  return hardEnd;
}

function sliceRanges(fullText: string, chunkSize: number, overlap: number): Array<{ start: number; end: number }> {
  if (fullText.length === 0) {
    return [];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;

  while (start < fullText.length) {
    const remaining = fullText.length - start;
    if (remaining <= chunkSize) {
      ranges.push({ start, end: fullText.length });
      break;
    }

    const cutEnd = findCutEnd(fullText, start, chunkSize);
    ranges.push({ start, end: cutEnd });
    let nextStart = cutEnd - overlap;
    if (nextStart <= start) {
      nextStart = cutEnd;
    }
    start = nextStart;
  }

  return ranges;
}

export function chunkDocument(parsed: ParsedDocument, options: ChunkOptions): TextChunk[] {
  const layout = buildLayout(parsed);
  const { fullText } = layout;

  const rawRanges = sliceRanges(fullText, options.chunk_size, options.chunk_overlap);
  const filtered = rawRanges.filter(({ start, end }) => end - start >= options.min_chunk_length);

  return filtered.map((range, chunk_index) => ({
    chunk_id: randomUUID(),
    chunk_text: fullText.slice(range.start, range.end),
    chunk_index,
    doc_id: parsed.doc_id,
    source_path: parsed.source_path,
    relative_path: parsed.relative_path,
    section_title: sectionTitleAt(range.start, layout)
  }));
}
