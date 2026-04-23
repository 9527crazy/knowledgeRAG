type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogContext {
  module?: string | undefined;
  code?: string | undefined;
  details?: Record<string, unknown> | undefined;
  cause?: unknown;
}

function formatCause(cause: unknown): string | undefined {
  if (!cause) {
    return undefined;
  }

  if (cause instanceof Error) {
    return cause.stack ?? `${cause.name}: ${cause.message}`;
  }

  return typeof cause === "string" ? cause : JSON.stringify(cause);
}

function serializeContext(context: LogContext): string {
  const parts: string[] = [];

  if (context.module) {
    parts.push(`[${context.module}]`);
  }

  if (context.code) {
    parts.push(`code=${context.code}`);
  }

  if (context.details && Object.keys(context.details).length > 0) {
    parts.push(`details=${JSON.stringify(context.details)}`);
  }

  const cause = formatCause(context.cause);
  if (cause) {
    parts.push(`cause=${cause}`);
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const line = `[${new Date().toISOString()}] ${level}${serializeContext(context)} ${message}`;

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  if (level === "WARN") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export interface Logger {
  debug(message: string, context?: Omit<LogContext, "module">): void;
  info(message: string, context?: Omit<LogContext, "module">): void;
  warn(message: string, context?: Omit<LogContext, "module">): void;
  error(message: string, context?: Omit<LogContext, "module">): void;
}

export function createLogger(module: string): Logger {
  return {
    debug(message, context) {
      write("DEBUG", message, { ...context, module });
    },
    info(message, context) {
      write("INFO", message, { ...context, module });
    },
    warn(message, context) {
      write("WARN", message, { ...context, module });
    },
    error(message, context) {
      write("ERROR", message, { ...context, module });
    }
  };
}
