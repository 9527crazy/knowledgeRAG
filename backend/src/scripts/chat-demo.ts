import { loadConfig, resetConfigCache } from "../../config";
import { createChatService } from "../service/chat-service";

const DEFAULT_QUESTION = "知识库的检索流程是什么？";
const PREVIEW_CHARS = 120;

function truncate(text: string | undefined, max = PREVIEW_CHARS): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });

  const argQuestion = process.argv.slice(2).join(" ").trim();
  const question = argQuestion.length > 0 ? argQuestion : DEFAULT_QUESTION;

  const service = createChatService(config);

  for await (const ev of service.streamAnswer(question)) {
    if (ev.type === "sources") {
      const preview = ev.items.map((s) => ({
        source_path: s.source_path,
        source_name: s.source_name,
        section_title: s.section_title,
        score: s.score,
        doc_title: s.doc_title,
        doc_type: s.doc_type,
        chunk_id: s.chunk_id,
        chunk_text: truncate(s.chunk_text)
      }));

      console.log(`--- sources (${ev.items.length}) ---`);
      console.log(JSON.stringify(preview, null, 2));
      console.log("--- answer ---");
      continue;
    }

    if (ev.type === "delta") {
      process.stdout.write(ev.text);
      continue;
    }

    if (ev.type === "error") {
      process.stderr.write(`\n[error] ${ev.message}\n`);
      process.exitCode = 1;
      continue;
    }

    if (ev.type === "done") {
      console.log("\n--- done ---");
      continue;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
