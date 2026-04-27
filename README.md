# knowledgeRAG

一个本地运行的 RAG 知识系统，用于把本地文档索引为可检索知识库，并基于检索结果生成带来源引用的回答。

第一阶段已实现「文档入库 → 向量检索 → LLM 生成 → HTTP/SSE API」闭环，并提供自动化测试与状态/重索引接口。

## 项目目标

- 本地文档索引：接入 `md`、`txt` 文档并构建知识库
- 本地语义检索：基于向量召回相关片段
- 检索增强问答：仅依据检索内容生成回答
- 来源可追溯：回答附带来源文件、章节和相似度信息
- 全链路本地运行：不依赖外部 API 和云服务

## 技术选型

第一阶段采用以下技术方案：


| 模块   | 选型                 |
| ---- | ------------------ |
| 运行时  | `Bun + TypeScript` |
| 生成模型 | `Qwen2.5:7b`       |
| 向量模型 | `bge-m3`           |
| 模型服务 | `Ollama`           |
| 向量存储 | Qdrant（本地 REST，默认 `http://127.0.0.1:6333`） |
| 索引台账 | `SQLite`           |


## 核心流程

### 索引链路

```text
知识目录
-> 文件扫描 / 监听
-> 文档解析
-> 文本切块
-> Embedding
-> 写入 Qdrant
-> 写入 SQLite 台账
```

### 查询链路

```text
用户提问
-> Query Embedding
-> Qdrant Top-K 检索
-> 相似度过滤
-> Prompt 组装
-> Qwen 生成回答
-> 返回答案与来源
```

## 第一阶段范围

当前阶段聚焦最小可运行版本，计划覆盖：

- `md` 和 `txt` 文档索引
- 增量索引与文件监听
- 向量检索与阈值过滤
- 基于检索上下文的单轮问答
- `POST /api/chat` SSE 流式输出
- `GET /api/status` 状态查询
- `POST /api/reindex` 手动重索引

暂不包含：

- PDF 解析
- 多轮对话记忆
- 混合检索
- 多知识库隔离
- 云端服务依赖

## 计划中的目录结构

```text
knowledgeRAG/
├── docs/                        # 项目文档
│   ├── coding-plan.md
│   ├── development-environment.md
│   ├── rag-principle.md
│   ├── requirement.md
│   ├── rule.md
│   ├── plan/
│   │   ├── 1.md
│   │   ├── 2.md
│   │   ├── 3.md
│   │   ├── 4.md
│   │   ├── 5.md
│   │   ├── 6.md
│   │   ├── 7.md
│   │   ├── 8.md
│   │   ├── 9.md
│   │   └── 10.md
│   └── test/
│       ├── 1.md
│       ├── 2.md
│       ├── 3.md
│       ├── 4.md
│       ├── 5.md
│       ├── 6.md
│       ├── 7.md
│       ├── 8.md
│       ├── 9.md
│       └── 10.md
└── backend/                     # 后端代码项目入口
    ├── config.ts
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── ingest/
    │   ├── query/
    │   ├── llm/
    │   ├── store/
    │   ├── config/
    │   ├── common/
    │   ├── server/
    │   └── scripts/
    ├── data/
    └── knowledge/
```

说明：仓库包含规划与设计文档与 `backend/` 代码；功能按分日计划持续落地。

## 开发计划

第一阶段按 `10 个工作日 / 40 小时` 规划推进，主线分为：

1. 项目初始化与基础骨架
2. 数据层与模型客户端封装
3. 文档读取与解析
4. 切块与增量索引状态机
5. Embedding 与入库主链路
6. 检索模块
7. Prompt 组装与回答生成
8. API 服务与联调
9. 文件监听、增量更新与异常补强
10. 测试、验收与文档收口

详细计划见：

- [docs/coding-plan.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/coding-plan.md)
- [docs/plan/1.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/1.md)
- [docs/plan/2.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/2.md)
- [docs/plan/3.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/3.md)
- [docs/plan/4.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/4.md)
- [docs/plan/5.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/5.md)
- [docs/plan/6.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/6.md)
- [docs/plan/7.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/7.md)
- [docs/plan/8.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/8.md)
- [docs/plan/9.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/9.md)
- [docs/plan/10.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/10.md)
- [docs/test/1.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/1.md)
- [docs/test/2.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/2.md)
- [docs/test/3.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/3.md)
- [docs/test/4.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/4.md)
- [docs/test/5.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/5.md)
- [docs/test/6.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/6.md)
- [docs/test/7.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/7.md)
- [docs/test/8.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/8.md)
- [docs/test/9.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/9.md)
- [docs/test/10.md](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/10.md)

## 文档导航

- [需求文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/requirement.md)
- [RAG 技术原理](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/rag-principle.md)
- [开发环境文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/development-environment.md)
- [项目规则文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/rule.md)
- [代码编写计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/coding-plan.md)
- [第 1 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/1.md)
- [第 2 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/2.md)
- [第 3 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/3.md)
- [第 4 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/4.md)
- [第 5 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/5.md)
- [第 6 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/6.md)
- [第 7 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/7.md)
- [第 8 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/8.md)
- [第 9 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/9.md)
- [第 10 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/10.md)
- [第 1 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/1.md)
- [第 2 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/2.md)
- [第 3 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/3.md)
- [第 4 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/4.md)
- [第 5 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/5.md)
- [第 6 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/6.md)
- [第 7 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/7.md)
- [第 8 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/8.md)
- [第 9 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/9.md)
- [第 10 天校验文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/test/10.md)

## 预期运行环境

- macOS（推荐）
- `Bun >= 1.1`
- **Ollama** 已运行，并已拉取模型：`qwen2.5:7b`、`bge-m3:latest`（名称与 `backend/app.config.json` 可一致）
- **Qdrant**：独立进程，REST 默认 `http://127.0.0.1:6333`（与 `@qdrant/js-client-rest` 默认一致）

## 快速开始（最小闭环）

```bash
cd backend
bun install
bun run health-check    # Ollama / Qdrant / 台账等自检，均为 ok 再继续
bun run index:full      # 首次建议全量索引（需 Ollama + Qdrant）
bun run dev             # HTTP 服务，默认端口见 app.config.json（如 3000）
```

另开终端快速探测：

```bash
curl -sS http://localhost:3000/healthz
curl -sS http://localhost:3000/api/status
curl -sS -X POST -H "Content-Type: application/json" -d '{"question":"什么是 RAG？"}' http://localhost:3000/api/chat
# SSE 流：输出中含 event: delta / sources / done
```

手动重跑失败文档（台账 `status=failed`）：

```bash
curl -sS -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3000/api/reindex
```

## 常用脚本（`backend/package.json`）

| 脚本 | 说明 |
| --- | --- |
| `bun run dev` | 启动 HTTP + 启动前 bootstrap 索引；默认启用文件监听（可用 `WATCH_DISABLED` 关闭） |
| `bun run start` | 同入口，无 `--watch` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun test` | `bun:test` 单元测试（切块 / 解析 / 状态机 / 检索 mock） |
| `bun run health-check` | 依赖健康检查 |
| `bun run index:full` | 全量索引管线 |
| `bun run watch:index` | 仅 bootstrap + watcher，便于调试监听 |
| `bun run query:demo` | 检索演示 |
| `bun run chat:demo` | 对话演示（非 HTTP） |

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `WATCH_DISABLED=1` | 禁用随 `bun run dev` 启动的文件系统 watcher（仍保留 HTTP 与启动时 bootstrap 索引） |
| `CORS_ORIGINS` | 跨域：未设置或 `*` 时允许任意 Origin（`Access-Control-Allow-Origin: *`）。设为逗号分隔列表（如 `http://localhost:5173,http://127.0.0.1:5173`）时仅允许这些来源；浏览器 `Origin` 不在列表内则预检返回 403 |

其余配置以 `backend/app.config.json`（及加载逻辑）为准。

## 已知问题与限制

| 现象 | 影响 | 规避 | 后续计划 |
| --- | --- | --- | --- |
| SQLite 高并发写入仍可能出现短暂锁等待 | watcher 密集事件时偶发延迟 | 已启用 WAL + `busy_timeout`；避免多进程同时写同一 `ledger.db` | 第二阶段评估连接池或队列 |
| Qdrant 未启动时 | `total_chunks` 为 0；索引/检索失败 | 先启动 Qdrant 再 `health-check` | 启动前强依赖校验（可选） |
| 仅支持 `md`/`txt` | 其他格式无法入库 | 转换后再放入知识目录 | PDF/代码库等第二阶段 |
| 无鉴权、无限流 | 本地信任网络可用 | 勿直接暴露公网 | 按需加中间件 |
| macOS `fs.watch` + 去抖 | 极端批量变更可能漏扫 | 关键变更后手动 `index:full` 或调用 `/api/reindex` | 加固扫描策略 |

## 端到端验收

完整清单见 [docs/test/10.md](docs/test/10.md)（含 `bun test`、API 字段与演示路径）。

## 当前状态

- 第一阶段文档与代码主线已完成（索引、检索、对话、`/api/chat` SSE、监听与增量、`GET /api/status`、`POST /api/reindex`、关键单元测试）。
- 详细过程文档见 `docs/plan/*.md` 与 `docs/test/*.md`。

**下一步（第二阶段规划）**：PDF 解析、多轮对话、混合检索、多 Collection、生产化运维与鉴权等（见 `docs/requirement.md` 后续章节）。
