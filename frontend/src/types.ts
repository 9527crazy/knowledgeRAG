export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ChatSource {
  source_path: string;
  source_name?: string;
  section_title: string;
  score: number;
  doc_title?: string;
  doc_type?: string;
  chunk_id?: string;
  chunk_text?: string;
}

export type ChatSseEventName = "delta" | "sources" | "done" | "error";

export interface SseDeltaPayload {
  text: string;
}

export interface SseSourcesPayload {
  items: ChatSource[];
}

export interface SseErrorPayload {
  message: string;
}

export interface ChatStreamHandlers {
  onSources?: (sources: ChatSource[]) => void;
  onDelta?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  pending?: boolean;
  errored?: boolean;
}

export interface StatusSourceStat {
  name: string;
  path: string;
  doc_count: number;
}

export interface StatusResponse {
  total_docs: number;
  total_chunks: number;
  failed_docs: number;
  indexing_docs: number;
  last_indexed_at: string | null;
  sources: StatusSourceStat[];
}

export interface ReindexRequest {
  doc_id?: string;
  mode?: "full_reset";
}

export interface ReindexResponse {
  mode?: "full_reset";
  scanned?: number;
  triggered: number;
  failed: number;
}
