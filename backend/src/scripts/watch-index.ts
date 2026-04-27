import { loadConfig, resetConfigCache } from "../../config";
import { createEmbedder } from "../ingest/embedder";
import { runBootstrapIndex } from "../ingest/bootstrap-index";
import { startWatcher } from "../ingest/watcher";
import { createLogger } from "../common/logger";
import { createLedgerStore } from "../store/ledger";
import { createVectorRepository } from "../store/vector-repository";

const log = createLogger("watch-index");

async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });

  const ledger = createLedgerStore(config);
  const embedder = createEmbedder(config);
  const vectorRepo = createVectorRepository(config);

  await runBootstrapIndex(config, { ledger, embedder, vectorRepo });

  const watcher = startWatcher(config, { ledger, embedder, vectorRepo });

  const stop = (): void => {
    log.info("shutdown");
    watcher.stop();
    ledger.close();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

