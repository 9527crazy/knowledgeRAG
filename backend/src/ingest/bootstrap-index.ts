import type { AppConfig } from "../config/types";
import { createLogger } from "../common/logger";
import type { LedgerStore } from "../store/ledger";
import { createLedgerStore } from "../store/ledger";
import type { VectorRepository } from "../store/vector-repository";
import { createVectorRepository } from "../store/vector-repository";
import type { Embedder } from "./embedder";
import { createEmbedder } from "./embedder";
import { scanSourceFiles } from "./file-scanner";
import { buildIndexPlan, hashScannedFiles } from "./index-state-machine";
import { executeIndexPlan } from "./index-document";

const log = createLogger("bootstrap-index");

export interface BootstrapDeps {
  ledger?: LedgerStore;
  embedder?: Embedder;
  vectorRepo?: VectorRepository;
}

export interface IndexCycleSummary {
  scanned: number;
  add: number;
  update: number;
  remove: number;
  skip: number;
  durationMs: number;
}

function summarizeActions(actions: Array<{ action: string }>): Omit<IndexCycleSummary, "scanned" | "durationMs"> {
  let add = 0;
  let update = 0;
  let remove = 0;
  let skip = 0;

  for (const item of actions) {
    if (item.action === "add") add++;
    else if (item.action === "update") update++;
    else if (item.action === "remove") remove++;
    else if (item.action === "skip") skip++;
  }

  return { add, update, remove, skip };
}

export async function runIndexCycle(config: AppConfig, deps: BootstrapDeps = {}): Promise<IndexCycleSummary> {
  const startAt = Date.now();

  const ledger = deps.ledger ?? createLedgerStore(config);
  const embedder = deps.embedder ?? createEmbedder(config);
  const vectorRepo = deps.vectorRepo ?? createVectorRepository(config);

  await ledger.ensureSchema();

  const scanned = await scanSourceFiles(config);
  const hashes = await hashScannedFiles(scanned);
  const plan = await buildIndexPlan(ledger, scanned, hashes);

  await executeIndexPlan(config, ledger, vectorRepo, embedder, scanned, hashes, plan);

  const durationMs = Date.now() - startAt;
  const counts = summarizeActions(plan);

  return {
    scanned: scanned.length,
    ...counts,
    durationMs
  };
}

export async function runBootstrapIndex(config: AppConfig, deps: BootstrapDeps = {}): Promise<IndexCycleSummary> {
  try {
    const summary = await runIndexCycle(config, deps);
    log.info("bootstrap done", { details: { ...summary } });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("bootstrap failed", { code: "BOOTSTRAP_INDEX_FAILED", details: { message }, cause: error });
    return { scanned: 0, add: 0, update: 0, remove: 0, skip: 0, durationMs: 0 };
  }
}

