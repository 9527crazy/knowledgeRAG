import path from "node:path";
import type { ParsedDocument, ScannedFile } from "../types";

function stripExtensionFromBasename(relativePosix: string): string {
  const base = path.posix.basename(relativePosix);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(0, dot) : base;
}

/**
 * TXT：整文件一节；section_title 为相对来源的目录路径（不含文件名），根目录下为空串。
 */
export function parsePlainText(scanned: ScannedFile, text: string, doc_id: string): ParsedDocument {
  const relativePosix = scanned.relative_path.replace(/\\/g, "/");
  const posixDir = path.posix.dirname(relativePosix);
  const section_title =
    posixDir === "." || posixDir === "" ? "" : posixDir.split("/").filter(Boolean).join("/");

  const doc_title = stripExtensionFromBasename(relativePosix);

  return {
    doc_id,
    doc_title,
    source_name: scanned.source_name,
    source_path: scanned.source_path,
    relative_path: scanned.relative_path,
    file_type: "text",
    sections: [
      {
        section_title,
        content: text,
        order: 0
      }
    ]
  };
}
