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
      "",
      "回答策略：",
      "1. 先判断用户问题真正想问什么，再从参考资料中提取相关事实。",
      "2. 对多个参考片段进行归纳、合并、去重和重组，用自然语言回答用户问题。",
      "3. 不要整段照抄参考资料；除非用户要求原文，否则只保留必要短引用。",
      "4. 如果参考资料之间有重复或碎片化内容，请整理成清晰条目。",
      "5. 如果参考资料不足以回答问题，请明确说明资料不足，并指出缺少什么信息。",
      "6. 回答末尾列出使用到的来源，包含 section_title 与 source_path。"
    ].join("\n")
  };

  const refBlocks = sources.map((s, i) => formatSourceBlock(i + 1, s)).join("\n\n");
  const user: ChatMessage = {
    role: "user",
    content: [`# 用户问题\n${trimmed}`, `# 参考资料\n${refBlocks}`].join("\n\n")
  };

  return [system, user];
}
