import type { AppConfig } from "../config/types";
import { createLogger } from "../common/logger";
import type { ChatClient } from "../llm/chat-client";
import { createChatClient } from "../llm/chat-client";
import { runRetrieval } from "../query";
import type { RetrievalResult, Source } from "../query";
import { buildChatMessages, EMPTY_FALLBACK_TEXT } from "../query/prompt-builder";

const log = createLogger("chat-service");

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "sources"; items: Source[] }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatServiceDeps {
  runRetrieval?: (config: AppConfig, question: string) => Promise<RetrievalResult>;
  chatClient?: ChatClient;
}

export interface ChatService {
  streamAnswer(question: string): AsyncIterable<ChatEvent>;
}

export function createChatService(config: AppConfig, deps: ChatServiceDeps = {}): ChatService {
  const doRetrieve = deps.runRetrieval ?? runRetrieval;
  const chatClient = deps.chatClient ?? createChatClient(config);

  return {
    async *streamAnswer(question: string): AsyncIterable<ChatEvent> {
      try {
        const retrieval = await doRetrieve(config, question);
        yield { type: "sources", items: retrieval.sources };

        if (retrieval.empty) {
          log.info("chat short-circuit (empty retrieval)");
          yield { type: "delta", text: EMPTY_FALLBACK_TEXT };
          yield { type: "done" };
          return;
        }

        const messages = buildChatMessages(question, retrieval.sources);
        if (process.env.PROMPT_DEBUG === "1") {
          console.error("[prompt]", JSON.stringify(messages, null, 2));
        }

        for await (const text of chatClient.streamChat(messages)) {
          if (text.length > 0) {
            yield { type: "delta", text };
          }
        }

        yield { type: "done" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "发生未知异常";
        yield { type: "error", message };
        yield { type: "done" };
      }
    }
  };
}
