import { loadConfig, resetConfigCache } from "../../config";
import { chunkDocument } from "../ingest/chunker";
import { buildIndexPlan, hashScannedFiles, persistIndexedDocument } from "../ingest/index-state-machine";
import { parseScannedFile } from "../ingest/parse";
import { scanSourceFiles } from "../ingest/file-scanner";
import { createLedgerStore } from "../store/ledger";

const shouldPersist = process.env.INDEX_PERSIST === "1" || process.env.INDEX_PERSIST === "true";

async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });
  const ledger = createLedgerStore(config);
  await ledger.ensureSchema();

  const scanned = await scanSourceFiles(config);
  const hashes = await hashScannedFiles(scanned);
  const plan = await buildIndexPlan(ledger, scanned, hashes);

  const chunkSamples: Array<{
    source_path: string;
    action: string;
    chunk_count: number;
    first_chunk_id: string | null;
  }> = [];

  for (const entry of plan) {
    if (entry.action !== "add" && entry.action !== "update") {
      continue;
    }

    const file = scanned.find((s) => s.source_path === entry.source_path);
    if (!file) {
      continue;
    }

    const parsed = await parseScannedFile(file);
    const chunks = chunkDocument(parsed, config);
    chunkSamples.push({
      source_path: entry.source_path,
      action: entry.action,
      chunk_count: chunks.length,
      first_chunk_id: chunks[0]?.chunk_id ?? null
    });

    if (shouldPersist) {
      const hash = hashes.get(entry.source_path);
      if (hash !== undefined) {
        persistIndexedDocument(ledger, parsed, hash, chunks);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        persist: shouldPersist,
        plan_summary: plan.map((e) => ({ action: e.action, source_path: e.source_path })),
        chunk_samples: chunkSamples
      },
      null,
      2
    )
  );

  ledger.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
