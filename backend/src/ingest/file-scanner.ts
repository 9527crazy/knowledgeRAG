import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { ConfigError } from "../common/errors";
import type { AppConfig } from "../config/types";
import type { ScannedFile, SupportedFileType } from "./types";

/** 将配置中的扩展名规范为带点、小写 */
function normalizeIncludePatterns(include: string[]): string[] {
  return include.map((raw) => {
    const trimmed = raw.trim().toLowerCase();
    return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
  });
}

function extensionToFileType(extension: string): SupportedFileType | undefined {
  const ext = extension.toLowerCase();
  if (ext === ".md" || ext === ".markdown") {
    return "markdown";
  }
  if (ext === ".txt") {
    return "text";
  }
  return undefined;
}

/** 扩展名是否在白名单且可映射为支持的 file_type */
function matchesInclude(extension: string, allowed: Set<string>): boolean {
  const ext = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  if (!allowed.has(ext)) {
    return false;
  }
  return extensionToFileType(ext) !== undefined;
}

async function collectFiles(rootDir: string, recursive: boolean): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        const nested = await collectFiles(fullPath, true);
        results.push(...nested);
      }
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

function toPosixRelative(sourceRoot: string, absolutePath: string): string {
  const rel = path.relative(sourceRoot, absolutePath);
  return rel.split(path.sep).join("/");
}

/**
 * 遍历配置中的全部来源目录，返回待解析文件列表（路径已排序）。
 */
export async function scanSourceFiles(config: AppConfig): Promise<ScannedFile[]> {
  const scanned: ScannedFile[] = [];

  for (const source of config.sources) {
    const sourceRoot = path.resolve(source.path);

    if (!existsSync(sourceRoot)) {
      throw new ConfigError(`知识来源目录不存在: ${sourceRoot}`, {
        details: { source_name: source.name, path: sourceRoot }
      });
    }

    const absolutePaths = await collectFiles(sourceRoot, source.recursive);
    const allowed = new Set(normalizeIncludePatterns(source.include));

    for (const absolutePath of absolutePaths) {
      const extension = path.extname(absolutePath).toLowerCase();
      if (!matchesInclude(extension, allowed)) {
        continue;
      }

      const fileType = extensionToFileType(extension);
      if (!fileType) {
        continue;
      }

      scanned.push({
        source_name: source.name,
        source_root: sourceRoot,
        source_path: absolutePath,
        relative_path: toPosixRelative(sourceRoot, absolutePath),
        extension: extension.startsWith(".") ? extension : `.${extension}`,
        file_type: fileType
      });
    }
  }

  scanned.sort((a, b) => a.source_path.localeCompare(b.source_path));
  return scanned;
}
