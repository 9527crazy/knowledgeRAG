/**
 * 浏览器跨域访问（如前端 dev server :5173 直连后端 :3000）所需的 CORS 响应头。
 *
 * - 未设置 `CORS_ORIGINS` 或值为 `*`：允许任意 Origin（`Access-Control-Allow-Origin: *`），适合本地开发。
 * - `CORS_ORIGINS` 为逗号分隔列表：仅当请求 `Origin` 命中列表时回显该 Origin；无 `Origin` 时回退为列表首项（便于 curl）。
 * - 若浏览器带了 Origin 且不在列表中：返回 `undefined`，调用方应拒绝预检并不附加放宽头。
 */
export function tryBuildCorsHeaders(req: Request): Headers | undefined {
  const origin = req.headers.get("Origin");
  const raw = process.env.CORS_ORIGINS?.trim();

  const base = (): Headers =>
    new Headers({
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400"
    });

  if (!raw || raw === "*") {
    const h = base();
    h.set("Access-Control-Allow-Origin", "*");
    return h;
  }

  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) {
    const h = base();
    h.set("Access-Control-Allow-Origin", "*");
    return h;
  }

  let allowOrigin: string | undefined;
  if (!origin) {
    allowOrigin = allowed[0];
  } else if (allowed.includes(origin)) {
    allowOrigin = origin;
  } else {
    return undefined;
  }

  const h = base();
  h.set("Access-Control-Allow-Origin", allowOrigin!);
  return h;
}

/** 将 CORS 头合并进已有响应（SSE 流体会原样传递）。 */
export function mergeCorsHeaders(response: Response, req: Request): Response {
  const cors = tryBuildCorsHeaders(req);
  if (!cors) {
    return response;
  }

  const headers = new Headers(response.headers);
  cors.forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
