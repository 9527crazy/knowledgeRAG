export interface AppErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  override readonly cause: unknown | undefined;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("CONFIG_ERROR", message, options);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("VALIDATION_ERROR", message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
