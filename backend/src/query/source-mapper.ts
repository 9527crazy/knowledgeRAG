import type { RetrievalCandidate, Source } from "./types";

/**
 * 将单条检索候选映射为对外稳定的 `Source` 结构。
 *
 * - 必备字段：`source_path` / `section_title` / `score`（与需求 §6.3 对齐）
 * - 扩展字段：`source_name` / `doc_title` / `doc_type` / `chunk_id` / `chunk_text`
 *   供第 7 天 Prompt 拼装与第 8 天 SSE `sources` 事件复用，
 *   不超出 §7.1 已经写入 payload 的字段范围。
 *
 * 本函数职责单一：仅做字段映射，不做去重 / 合并 / 截断；
 * 上层（如 prompt-builder）如需合并由其负责。
 */
export function mapCandidateToSource(candidate: RetrievalCandidate): Source {
  const { score, payload } = candidate;
  return {
    source_path: payload.source_path,
    source_name: payload.source_name,
    section_title: payload.section_title,
    score,
    doc_title: payload.doc_title,
    doc_type: payload.doc_type,
    chunk_id: candidate.chunk_id,
    chunk_text: payload.chunk_text
  };
}

export function mapCandidatesToSources(candidates: RetrievalCandidate[]): Source[] {
  return candidates.map(mapCandidateToSource);
}
