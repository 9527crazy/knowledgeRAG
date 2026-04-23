import type { AppConfig } from "../config/types";

/** 白名单扩展名映射出的文件类型（第 3 天仅 md / txt） */
export type SupportedFileType = "markdown" | "text";

/** 单次目录扫描得到的待解析文件引用 */
export interface ScannedFile {
  source_name: string;
  /** 该来源根目录（绝对路径） */
  source_root: string;
  /** 文件绝对路径 */
  source_path: string;
  /** 相对来源根的路径，统一为正斜杠 */
  relative_path: string;
  /** 包含前导点的小写扩展名，如 `.md` */
  extension: string;
  file_type: SupportedFileType;
}

/** 文档内一节；供切块模块消费 */
export interface ParsedSection {
  /** 目录层级与标题层级以 `/` 拼接；无前文标题时可为空串（见 Markdown 默认段约定） */
  section_title: string;
  /** 该节原始文本（Markdown 中含对应标题行） */
  content: string;
  /** 文档内顺序，从 0 递增 */
  order: number;
}

/** 单文件解析结果 */
export interface ParsedDocument {
  doc_id: string;
  doc_title: string;
  source_name: string;
  source_path: string;
  relative_path: string;
  file_type: SupportedFileType;
  sections: ParsedSection[];
}

/** 切块参数（对应 AppConfig 同名项） */
export type ChunkOptions = Pick<AppConfig, "chunk_size" | "chunk_overlap" | "min_chunk_length">;

/**
 * 切块边界：丢弃长度 **严格小于** `min_chunk_length` 的片段（长度等于阈值时保留）。
 */

/** 单文本块（入库前向量未写入亦可落台账 UUID 列表） */
export interface TextChunk {
  chunk_id: string;
  chunk_text: string;
  /** 文档内序号，过滤短块后从 0 连续递增 */
  chunk_index: number;
  doc_id: string;
  source_path: string;
  relative_path: string;
  section_title: string;
}

/** 增量动作（纯决策层，不含 Embedding/Qdrant） */
export type IndexAction = "skip" | "add" | "update" | "remove";

/** SQLite document_index 行（与 ledger 表字段一致） */
export interface DocumentIndexRow {
  source_path: string;
  doc_id: string | null;
  content_hash: string | null;
  chunk_ids: string | null;
  status: string;
  error_msg: string | null;
  indexed_at: string | null;
  updated_at: string;
}

/** 单次索引计划条目 */
export interface IndexPlanEntry {
  action: IndexAction;
  source_path: string;
  /** 当前磁盘文件 hash（skip/add/update 时有意义） */
  content_hash?: string;
  doc_id?: string;
  /** update/remove 时带出旧台账，便于删除旧向量 */
  previousRecord?: DocumentIndexRow;
}
