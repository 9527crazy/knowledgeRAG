import fs from "node:fs";
import path from "node:path";
import type { AppConfig, SourceConfig } from "../config/types";
import { createLogger } from "../common/logger";
import type { BootstrapDeps } from "./bootstrap-index";
import { runIndexCycle } from "./bootstrap-index";

const log = createLogger("watcher");

function normalizeIncludeSet(include: string[]): Set<string> {
  return new Set(
    include.map((raw) => {
      const trimmed = raw.trim().toLowerCase();
      return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    })
  );
}

function isAllowedFileBySource(absPath: string, source: SourceConfig): boolean {
  const ext = path.extname(absPath).toLowerCase();
  const allowed = normalizeIncludeSet(source.include);
  return allowed.has(ext);
}

function resolveChangedPath(sourceRoot: string, filename: string | null): string | undefined {
  if (!filename) {
    return undefined;
  }
  // fs.watch returns relative path (usually) on macOS; handle absolute just in case
  return path.isAbsolute(filename) ? filename : path.join(sourceRoot, filename);
}

export interface WatcherHandle {
  stop(): void;
}

export function startWatcher(config: AppConfig, deps: BootstrapDeps = {}): WatcherHandle {
  const watchers: fs.FSWatcher[] = [];
  const debounce = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Set<string>();

  let running = false;
  let dirty = false;
  let stopped = false;

  const scheduleCycle = (): void => {
    if (stopped) return;
    if (running) {
      dirty = true;
      return;
    }

    running = true;
    void (async () => {
      try {
        const summary = await runIndexCycle(config, deps);
        log.info("index cycle done", { details: { ...summary } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("index cycle failed", { code: "INDEX_CYCLE_FAILED", details: { message }, cause: error });
      } finally {
        running = false;
        const shouldRunAgain = dirty;
        dirty = false;
        pending.clear();
        if (shouldRunAgain) {
          scheduleCycle();
        }
      }
    })();
  };

  const enqueue = (absPath: string): void => {
    pending.add(absPath);
    scheduleCycle();
  };

  for (const source of config.sources) {
    const sourceRoot = path.resolve(source.path);

    try {
      const watcher = fs.watch(sourceRoot, { recursive: source.recursive }, (eventType, filename) => {
        if (stopped) return;

        const abs = resolveChangedPath(sourceRoot, filename ?? null);
        if (!abs) {
          // Cannot attribute to a specific file; run a cycle.
          dirty = true;
          scheduleCycle();
          return;
        }

        if (!isAllowedFileBySource(abs, source)) {
          return;
        }

        const key = abs;
        const prev = debounce.get(key);
        if (prev) clearTimeout(prev);

        debounce.set(
          key,
          setTimeout(() => {
            debounce.delete(key);
            log.info("fs event", { details: { eventType, path: abs, source: source.name } });
            enqueue(abs);
          }, 300)
        );
      });

      watchers.push(watcher);
      log.info("watch started", { details: { source: source.name, path: sourceRoot, recursive: source.recursive } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("watch start failed", {
        code: "WATCH_START_FAILED",
        details: { source: source.name, path: sourceRoot, message },
        cause: error
      });
    }
  }

  return {
    stop() {
      stopped = true;
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // ignore
        }
      }
      watchers.length = 0;
      for (const t of debounce.values()) {
        clearTimeout(t);
      }
      debounce.clear();
      pending.clear();
    }
  };
}

