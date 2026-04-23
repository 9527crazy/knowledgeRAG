import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { IngestError } from "../common/errors";

/** 计算文件的 MD5（十六进制小写），用于与台账 `content_hash` 比对 */
export async function hashFileContent(absolutePath: string): Promise<string> {
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    throw new IngestError("索引文件不存在或不可访问", {
      details: { path: absolutePath }
    });
  }

  if (!fileStat.isFile()) {
    throw new IngestError("路径不是常规文件", {
      details: { path: absolutePath }
    });
  }

  const buffer = await readFile(absolutePath);
  return createHash("md5").update(buffer).digest("hex");
}
