import type { ChunkPayload } from "../store/vector-repository";

export interface RetrievalCandidate {
  chunk_id: string;
  score: number;
  payload: ChunkPayload;
}

/**
 * 对齐需求文档 §6.3：每次回答需附带来源信息。
 * 第 6 天只负责检索与来源结构；第 7 天再做 Prompt 拼装与回答生成。
 */
export interface Source {
  source_path: string;
  source_name?: string;
  section_title: string;
  score: number;

  /** 便于后续 Prompt 拼装与定位（来自 payload / candidate） */
  doc_title?: string;
  doc_type?: string;
  chunk_id?: string;
  chunk_text?: string;
}

export interface RetrievalResult {
  candidates: RetrievalCandidate[];
  sources: Source[];
  /** 过滤后无结果，用于上层短路（不调用 LLM） */
  empty: boolean;
}

