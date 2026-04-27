# knowledgeRAG 前端控制台

最简的 Vue 3 + Vite + TypeScript 单页应用，对接 `backend/` 暴露的三个 HTTP 接口：

- `POST /api/chat`：流式问答（SSE，事件 `sources` / `delta` / `done` / `error`）
- `GET  /api/status`：索引概览（文档数、向量数、最近索引时间、数据源等）
- `POST /api/reindex`：触发重建（默认重建 `failed`，可通过 `doc_id` 定向重建）

UI 采用 **Material Design 3**（[`@material/web`](https://github.com/material-components/material-web)）+ **Tailwind CSS v4**（`@tailwindcss/vite`）。Tailwind 负责布局/排版/响应式与 token 驱动的颜色系统，M3 负责按钮、文本框、进度等交互组件。

## 快速开始

```bash
# 1. 启动后端（另开一个终端，参考仓库根 README）
cd backend && bun run src/index.ts

# 2. 启动前端
cd frontend
pnpm install
pnpm dev      # http://localhost:5173
```

打开浏览器访问 `http://localhost:5173`：

- 顶部 Tab 切换「对话」与「索引状态」两个视图。
- 「对话」：输入问题后回车（或点「发送」）触发 SSE 流式回答；流中可点「中止」终止当前请求。
- 「索引状态」：刷新查看后端 ledger / Qdrant 概览，并可触发重建索引（全部失败项 / 指定 `doc_id`）。

## 常用脚本

| 命令              | 说明                                |
| ----------------- | ----------------------------------- |
| `pnpm dev`        | 启动 Vite 开发服务器（默认 5173）   |
| `pnpm typecheck`  | `vue-tsc -b --noEmit` 类型检查      |
| `pnpm build`      | 类型检查 + 生产构建到 `dist/`       |
| `pnpm preview`    | 本地预览构建产物                    |

## 环境变量

复制 `.env.example` 为 `.env.local` 并按需修改：

```
VITE_API_BASE_URL=http://localhost:3000
```

- 留空（推荐开发态）：所有 `/api/*` 走相对路径，由 `vite.config.ts` 的 `server.proxy` 代理到 `http://localhost:3000`，无需后端 CORS。
- 显式填写绝对地址：前端**直连**该后端。后端已内置 CORS 中间件（`backend/src/server/cors.ts`），开发态默认放开任意 Origin；生产态可在后端设置 `CORS_ORIGINS` 限制白名单。

## 与后端的对接细节

- **流式协议**：使用 [`@microsoft/fetch-event-source`](https://www.npmjs.com/package/@microsoft/fetch-event-source) 进行 `POST + text/event-stream`。后端 SSE 事件名与字段定义见 `backend/src/server/routes/chat.ts` 与 `backend/src/service/chat-service.ts`。
- **取消请求**：`AbortController` 同时控制 fetch 与 SSE；点击「中止」会立即关闭流，已生成的内容保留。
- **错误处理**：网络/HTTP 错误统一包装为 `ApiError(status, code, message, details)`；SSE 中收到 `error` 事件会展示在消息气泡与底部 Banner。

## 目录结构

```
frontend/
├── index.html
├── vite.config.ts            # Vue + Tailwind 插件 + /api 代理 + isCustomElement: md-*
├── src/
│   ├── main.ts               # 注册 @material/web 组件 + 挂载
│   ├── style.css             # Tailwind v4 + M3 颜色 token + 字体
│   ├── App.vue               # 顶栏 Tabs（chat / status）
│   ├── router/index.ts
│   ├── api/
│   │   ├── base.ts           # fetch 封装 + ApiError
│   │   ├── chat.ts           # SSE 流式问答
│   │   ├── status.ts         # GET /api/status
│   │   └── reindex.ts        # POST /api/reindex
│   ├── components/
│   │   ├── SourcesList.vue   # 回答下方折叠的来源列表
│   │   └── ReindexPanel.vue  # 重建按钮与结果反馈
│   ├── views/
│   │   ├── ChatView.vue      # 输入 / 发送 / 流式追加 / 中止
│   │   └── StatusView.vue    # 概览卡片 + 数据源列表 + 重建面板
│   └── types.ts              # 与后端事件字段对齐的类型
└── tsconfig*.json
```

## 已知限制

- 不做用户体系/鉴权/多会话持久化（与后端 MVP 一致，刷新页面会清空对话）。
- 仅在 Chrome / 现代浏览器验证；M3 自定义元素需要原生 Custom Elements 支持。
- Markdown 渲染暂未启用，回答按纯文本展示，保留换行。

如需切到 Stage 2（多会话历史 / 知识库管理界面 / 鉴权），可在 `docs/frontEnd/requirement.md` 增加章节后再迭代。
