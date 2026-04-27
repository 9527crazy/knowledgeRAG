import { loadConfig, resetConfigCache } from "../../config";
import { runRetrieval } from "../query";

const DEFAULT_QUESTION = "知识库的检索流程是什么？";
const PREVIEW_CHARS = 120;

function truncate(text: string | undefined, max = PREVIEW_CHARS): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 第 6 天验收脚本：
 * - 不带参数走默认 demo 问题；
 * - 透出 question / top_k / similarity_threshold / empty / sources，便于人眼观察；
 * - 与 docs/test/6.md 第 7、8、9 节对齐（包括调高 SIMILARITY_THRESHOLD 后的空结果）。
 */
async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });

  const argQuestion = process.argv.slice(2).join(" ").trim();
  const question = argQuestion.length > 0 ? argQuestion : DEFAULT_QUESTION;

  const result = await runRetrieval(config, question);

  const previewSources = result.sources.map((s) => ({
    source_path: s.source_path,
    source_name: s.source_name,
    section_title: s.section_title,
    score: s.score,
    doc_title: s.doc_title,
    doc_type: s.doc_type,
    chunk_id: s.chunk_id,
    chunk_text: truncate(s.chunk_text)
  }));

  console.log(
    JSON.stringify(
      {
        question,
        top_k: config.top_k,
        similarity_threshold: config.similarity_threshold,
        collection: config.qdrant_collection_name,
        empty: result.empty,
        candidate_count: result.candidates.length,
        sources: previewSources
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
