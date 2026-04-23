import { loadConfig, resetConfigCache } from "../../config";
import { createEmbedder } from "../ingest/embedder";
import { buildIndexPlan, hashScannedFiles } from "../ingest/index-state-machine";
import { executeIndexPlan, parseChunkIdsFromRecord } from "../ingest/index-document";
import { scanSourceFiles } from "../ingest/file-scanner";
import { createLedgerStore } from "../store/ledger";
import { createVectorRepository } from "../store/vector-repository";

/**
 * 全量扫描 → 增量计划 → Ollama Embedding → Qdrant → SQLite（需本地 Ollama + Qdrant）。
 */
async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });

  const ledger = createLedgerStore(config);
  const embedder = createEmbedder(config);
  const vectorRepo = createVectorRepository(config);

  await ledger.ensureSchema();

  const scanned = await scanSourceFiles(config);
  const hashes = await hashScannedFiles(scanned);
  const plan = await buildIndexPlan(ledger, scanned, hashes);

  console.log(
    JSON.stringify(
      {
        scanned_count: scanned.length,
        plan_actions: plan.map((p) => ({ action: p.action, source_path: p.source_path }))
      },
      null,
      2
    )
  );

  await executeIndexPlan(config, ledger, vectorRepo, embedder, scanned, hashes, plan);

  const after = ledger.listDocuments();
  console.log(
    JSON.stringify(
      {
        ledger_rows: after.length,
        summary: after.map((r) => ({
          source_path: r.source_path,
          status: r.status,
          chunk_ids_len: parseChunkIdsFromRecord(r).length
        }))
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
