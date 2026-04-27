import type { StatusResponse } from "../types";
import { requestJson } from "./base";

export function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
  return requestJson<StatusResponse>("/api/status", {
    method: "GET",
    ...(signal ? { signal } : {})
  });
}
