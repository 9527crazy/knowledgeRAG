import type { ApiErrorBody } from "../types";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function buildUrl(path: string): string {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

async function parseError(response: Response): Promise<ApiError> {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  if (bodyText.length > 0) {
    try {
      const data = JSON.parse(bodyText) as Partial<ApiErrorBody>;
      const err = data?.error;
      if (err && typeof err.code === "string" && typeof err.message === "string") {
        return new ApiError(response.status, err.code, err.message, err.details);
      }
    } catch {
      // not JSON
    }
  }

  return new ApiError(response.status, "HTTP_ERROR", `HTTP ${response.status} ${response.statusText}`.trim());
}

export interface RequestJsonInit {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  mode?: RequestMode;
}

export async function requestJson<T>(path: string, init: RequestJsonInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  let body: BodyInit | undefined;

  if (init.body !== undefined && init.body !== null) {
    if (
      typeof init.body === "string" ||
      init.body instanceof ArrayBuffer ||
      init.body instanceof Blob ||
      init.body instanceof FormData ||
      init.body instanceof URLSearchParams ||
      init.body instanceof ReadableStream
    ) {
      body = init.body;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const fetchInit: RequestInit = { headers };
  if (init.method !== undefined) fetchInit.method = init.method;
  if (init.signal !== undefined) fetchInit.signal = init.signal;
  if (init.credentials !== undefined) fetchInit.credentials = init.credentials;
  if (init.cache !== undefined) fetchInit.cache = init.cache;
  if (init.mode !== undefined) fetchInit.mode = init.mode;
  if (body !== undefined) fetchInit.body = body;

  const response = await fetch(buildUrl(path), fetchInit);

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
