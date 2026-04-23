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
