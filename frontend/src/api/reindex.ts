import type { ReindexRequest, ReindexResponse } from "../types";
import { requestJson } from "./base";

export function postReindex(payload: ReindexRequest = {}, signal?: AbortSignal): Promise<ReindexResponse> {
  return requestJson<ReindexResponse>("/api/reindex", {
    method: "POST",
    body: payload,
    ...(signal ? { signal } : {})
  });
}
