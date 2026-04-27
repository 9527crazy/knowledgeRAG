import { ValidationError } from "../common/errors";
import type { ChatMessage } from "../llm/chat-client";
import type { Source } from "./types";

export const EMPTY_FALLBACK_TEXT =
  "资料中未找到与该问题直接相关的内容，无法据此作答。可尝试调整问题表述，或检查知识库是否包含相关文档。";

function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(4) : String(score);
}

function formatSourceBlock(index: number, s: Source): string {
  const lines: string[] = [];
  lines.push(`[${index}] section_title: ${s.section_title}`);
  lines.push(`    source_path: ${s.source_path}`);
  lines.push(`    score: ${formatScore(s.score)}`);
  lines.push("    --");
  lines.push(s.chunk_text ?? "");
  return lines.join("\n");
}

export function buildChatMessages(question: string, sources: Source[]): ChatMessage[] {
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("question 不能为空");
  }

  if (sources.length === 0) {
    throw new ValidationError("空来源不应进入 Prompt 拼装");
  }

  const system: ChatMessage = {
    role: "system",
    content: [
      "你是一个本地知识库问答助手。",
      "你必须仅根据我提供的【参考资料】回答，不得编造或凭空推测。",
      "如果参考资料不足以回答问题，请明确说明资料不足并给出简短建议。",
      "回答时尽量引用对应的 section_title 与 source_path，便于追溯来源。"
    ].join("\n")
  };

  const refBlocks = sources.map((s, i) => formatSourceBlock(i + 1, s)).join("\n\n");
  const user: ChatMessage = {
    role: "user",
    content: [`# 用户问题\n${trimmed}`, `# 参考资料\n${refBlocks}`].join("\n\n")
  };

  return [system, user];
}
