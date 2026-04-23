import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { ConfigError, ValidationError } from "../common/errors";
import { defaultConfig } from "./defaults";
import { appConfigSchema } from "./schema";
import type { AppConfig, AppConfigInput, SourceConfig } from "./types";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultConfigFile = path.join(backendRoot, "app.config.json");

let cachedConfig: AppConfig | undefined;

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new ConfigError("布尔环境变量格式无效", { details: { value } });
}

function parseNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new ConfigError(`${field} 环境变量必须是数字`, {
      details: { field, value }
    });
  }
  return parsed;
}

function mergeSources(defaultSources: SourceConfig[], overrideSources?: Array<Partial<SourceConfig>>): SourceConfig[] {
  if (!overrideSources) {
    return defaultSources.map((source) => ({ ...source, include: [...source.include] }));
  }

  if (overrideSources.length === 0) {
    return [];
  }

  return overrideSources.map((source, index) => {
    const fallback = defaultSources[index] ?? defaultSources[0]!;
    return {
      name: source.name ?? fallback.name,
      path: source.path ?? fallback.path,
      include: source.include ? [...source.include] : [...fallback.include],
      recursive: source.recursive ?? fallback.recursive
    };
  });
}

function mergeConfig(base: AppConfig, override: AppConfigInput): AppConfig {
  const entries = Object.entries(override).filter(([, value]) => value !== undefined) as Array<
    [keyof AppConfigInput, AppConfigInput[keyof AppConfigInput]]
  >;
  const definedOverride = Object.fromEntries(entries) as Partial<AppConfig>;

  return {
    ...base,
    ...definedOverride,
    sources: mergeSources(base.sources, override.sources)
  };
}

async function readJsonConfig(configFilePath: string): Promise<AppConfigInput> {
  if (!existsSync(configFilePath)) {
    return {};
  }

  try {
    const raw = await readFile(configFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ConfigError("app.config.json 必须是 JSON 对象", {
        details: { configFilePath }
      });
    }

    return parsed as AppConfigInput;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    throw new ConfigError("读取 app.config.json 失败", {
      cause: error,
      details: { configFilePath }
    });
  }
}

function getEnvSourceConfig(): Array<Partial<SourceConfig>> | undefined {
  const raw = process.env.SOURCES_JSON;
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new ConfigError("SOURCES_JSON 必须是数组");
    }
    return parsed as Array<Partial<SourceConfig>>;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    throw new ConfigError("SOURCES_JSON 解析失败", {
      cause: error
    });
  }
}

function getEnvOverride(): AppConfigInput {
  const env = process.env;
  const override: AppConfigInput = {};
  const sources = getEnvSourceConfig();

  if (sources) {
    override.sources = sources;
  }

  if (env.CHUNK_SIZE) {
    override.chunk_size = parseNumber(env.CHUNK_SIZE, "CHUNK_SIZE");
  }

  if (env.CHUNK_OVERLAP) {
    override.chunk_overlap = parseNumber(env.CHUNK_OVERLAP, "CHUNK_OVERLAP");
  }

  if (env.MIN_CHUNK_LENGTH) {
    override.min_chunk_length = parseNumber(env.MIN_CHUNK_LENGTH, "MIN_CHUNK_LENGTH");
  }

  if (env.TOP_K) {
    override.top_k = parseNumber(env.TOP_K, "TOP_K");
  }

  if (env.SIMILARITY_THRESHOLD) {
    override.similarity_threshold = parseNumber(env.SIMILARITY_THRESHOLD, "SIMILARITY_THRESHOLD");
  }

  if (env.OLLAMA_BASE_URL !== undefined) {
    override.ollama_base_url = env.OLLAMA_BASE_URL;
  }

  if (env.LLM_MODEL !== undefined) {
    override.llm_model = env.LLM_MODEL;
  }

  if (env.EMBEDDING_MODEL !== undefined) {
    override.embedding_model = env.EMBEDDING_MODEL;
  }

  if (env.LLM_TEMPERATURE) {
    override.llm_temperature = parseNumber(env.LLM_TEMPERATURE, "LLM_TEMPERATURE");
  }

  if (env.LLM_MAX_TOKENS) {
    override.llm_max_tokens = parseNumber(env.LLM_MAX_TOKENS, "LLM_MAX_TOKENS");
  }

  if (env.SERVER_PORT) {
    override.server_port = parseNumber(env.SERVER_PORT, "SERVER_PORT");
  }

  if (env.QDRANT_COLLECTION_NAME !== undefined) {
    override.qdrant_collection_name = env.QDRANT_COLLECTION_NAME;
  }

  if (env.EMBEDDING_DIMENSIONS) {
    override.embedding_dimensions = parseNumber(env.EMBEDDING_DIMENSIONS, "EMBEDDING_DIMENSIONS");
  }

  if (env.QDRANT_PATH !== undefined) {
    override.qdrant_path = env.QDRANT_PATH;
  }

  if (env.LEDGER_PATH !== undefined) {
    override.ledger_path = env.LEDGER_PATH;
  }

  return override;
}

function normalizePaths(config: AppConfig): AppConfig {
  return {
    ...config,
    sources: config.sources.map((source) => ({
      ...source,
      path: path.resolve(backendRoot, source.path)
    })),
    qdrant_path: path.resolve(backendRoot, config.qdrant_path),
    ledger_path: path.resolve(backendRoot, config.ledger_path)
  };
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}

export interface LoadConfigOptions {
  configFilePath?: string;
  forceReload?: boolean;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const configFilePath = options.configFilePath ?? defaultConfigFile;

  if (cachedConfig && !options.forceReload && configFilePath === defaultConfigFile) {
    return cachedConfig;
  }

  const jsonConfig = await readJsonConfig(configFilePath);
  const mergedConfig = mergeConfig(mergeConfig(defaultConfig, jsonConfig), getEnvOverride());

  try {
    const validatedConfig = appConfigSchema.parse(mergedConfig);
    const normalizedConfig = normalizePaths(validatedConfig);

    if (configFilePath === defaultConfigFile) {
      cachedConfig = normalizedConfig;
    }

    return normalizedConfig;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(`配置校验失败: ${formatZodError(error)}`, {
        cause: error,
        details: { configFilePath }
      });
    }

    throw error;
  }
}

export function resetConfigCache(): void {
  cachedConfig = undefined;
}
