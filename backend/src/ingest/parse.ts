import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseMarkdown } from "./parsers/markdown";
import { parsePlainText } from "./parsers/text";
import type { ParsedDocument, ScannedFile } from "./types";

/** 稳定文档 id：`source_name` + NUL + POSIX `relative_path` → SHA-256（十六进制） */
export function makeDocId(source_name: string, relative_path: string): string {
  const hash = createHash("sha256");
  hash.update(source_name);
  hash.update("\0");
  hash.update(relative_path);
  return `doc_${hash.digest("hex")}`;
}

export async function parseScannedFile(scanned: ScannedFile): Promise<ParsedDocument> {
  const raw = await readFile(scanned.source_path, "utf8");
  const doc_id = makeDocId(scanned.source_name, scanned.relative_path);

  if (scanned.file_type === "markdown") {
    return parseMarkdown(scanned, raw, doc_id);
  }

  return parsePlainText(scanned, raw, doc_id);
}
