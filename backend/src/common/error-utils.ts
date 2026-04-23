import { AppError, isAppError } from "./errors";

export interface ErrorSummary {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function summarizeError(error: unknown, fallbackCode = "UNKNOWN_ERROR"): ErrorSummary {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    };
  }

  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message
    };
  }

  return {
    code: fallbackCode,
    message: typeof error === "string" ? error : JSON.stringify(error)
  };
}

export function toErrorContext(error: unknown): { code: string; details?: Record<string, unknown>; cause?: unknown } {
  const summary = summarizeError(error);

  return {
    code: summary.code,
    ...(summary.details ? { details: summary.details } : {}),
    cause: error
  };
}
