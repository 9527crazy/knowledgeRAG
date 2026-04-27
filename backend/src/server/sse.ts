export const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no"
} as const;

export function encodeSseEvent(event: string, data?: unknown): string {
  let out = `event: ${event}\n`;
  if (data !== undefined) {
    out += `data: ${JSON.stringify(data)}\n`;
  }
  out += "\n";
  return out;
}

