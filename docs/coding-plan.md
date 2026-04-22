# 代码编写计划

## 1. 计划说明

本文档基于以下文档制定：

- [需求文档](./requirement.md)
- [RAG 技术原理](./rag-principle.md)
- [开发环境文档](./development-environment.md)

计划假设：

- 每天有效开发时间为 `4 小时`
- 当前目标是完成第一阶段可运行版本
- 技术选型以 `requirement.md` 为准
- 向量存储采用 `Qdrant embedded`
- 运行时采用 `Bun + TypeScript`
- 仓库根目录下创建 `backend/` 作为后端代码项目入口

本计划以“先跑通主链路，再补强稳定性”的方式推进，避免前期陷入过度设计。

---

## 2. 总体周期

按每天 4 小时估算，第一阶段建议拆分为 `10 个工作日`，总计约 `40 小时`。

阶段目标如下：

| 阶段 | 天数 | 目标 |
| --- | --- | --- |
| 基础设施搭建 | 第 1-2 天 | 跑通开发环境、项目骨架、配置加载 |
| 索引链路开发 | 第 3-5 天 | 跑通文档读取、切块、Embedding、入库 |
| 查询链路开发 | 第 6-7 天 | 跑通检索、Prompt 组装、LLM 生成 |
| API 与联调 | 第 8 天 | 暴露接口并完成端到端联调 |
| 稳定性与验收 | 第 9-10 天 | 补测试、修问题、整理文档与验收 |

---

## 3. 每日开发计划

## 第 1 天：项目初始化与基础骨架

### 当日任务

- 初始化 `Bun + TypeScript` 项目
- 建立基础目录结构
- 增加基础脚本定义
- 增加统一配置加载模块
- 建立基础日志与错误处理约定

建议产出：

- `backend/src/` 基础目录
- `backend/config.ts`
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/src/config/`
- `backend/src/shared/` 或 `backend/src/common/`

### 验收标准

- 在 `backend/` 目录执行 `bun install` 无报错
- 执行基础启动命令无报错
- 配置文件可被正确读取
- 项目目录结构与文档约定一致

---

## 第 2 天：数据层与模型客户端封装

### 当日任务

- 封装 `Ollama` HTTP 客户端
- 封装 `Qdrant embedded` 初始化逻辑
- 封装 `SQLite` 台账初始化逻辑
- 创建 `document_index` 表结构
- 编写基础连通性验证脚本

建议产出：

- `backend/src/llm/ollama-client.ts`
- `backend/src/store/qdrant.ts`
- `backend/src/store/ledger.ts`
- `backend/src/scripts/health-check.ts`

### 验收标准

- 程序启动时能连接本地 `Ollama`
- 可成功初始化 Qdrant 本地存储目录
- 可成功创建 SQLite 台账表
- 健康检查脚本能输出各依赖状态

---

## 第 3 天：文档读取与解析模块

### 当日任务

- 实现知识源目录扫描
- 支持 `md` 和 `txt` 文件过滤
- 实现 Markdown 标题解析
- 生成统一的文档结构对象
- 提取 `doc_id`、`doc_title`、`source_path`、`section_title`

建议产出：

- `backend/src/ingest/file-scanner.ts`
- `backend/src/ingest/parsers/markdown.ts`
- `backend/src/ingest/parsers/text.ts`
- `backend/src/ingest/types.ts`

### 验收标准

- 能扫描一个或多个配置目录
- 仅处理配置白名单中的文件类型
- Markdown 文档能提取标题层级信息
- TXT 文档能正确生成基础元数据
- 至少准备 3 个样例文件验证解析结果

---

## 第 4 天：切块与增量索引状态机

### 当日任务

- 实现递归字符切块逻辑
- 支持 `chunk_size`、`chunk_overlap`、`min_chunk_length`
- 实现文件内容 hash 计算
- 实现新增、跳过、更新、删除的状态判断逻辑
- 串联 SQLite 台账读写

建议产出：

- `backend/src/ingest/chunker.ts`
- `backend/src/ingest/hash.ts`
- `backend/src/ingest/index-state-machine.ts`

### 验收标准

- 长文本可以稳定切成多个 chunk
- chunk 数量、重叠规则符合配置
- 同一文件未变更时不会重复索引
- 文件变更后能够识别为更新流程
- 文件删除后能识别为删除流程

---

## 第 5 天：Embedding 与入库主链路

### 当日任务

- 调用 `bge-m3` 生成 chunk 向量
- 增加失败重试机制
- 将向量和 payload 写入 Qdrant
- 将 chunk IDs、hash、状态写入 SQLite
- 完成单文档索引流程闭环

建议产出：

- `backend/src/ingest/embedder.ts`
- `backend/src/ingest/index-document.ts`
- `backend/src/store/vector-repository.ts`

### 验收标准

- 单篇 `md` 文档可以完整入库
- Qdrant 中能查到对应向量与 payload
- SQLite 中能查到该文档台账记录
- Embedding 失败时能正确重试并记录失败状态
- 日志中可看到完整索引链路

---

## 第 6 天：检索模块开发

### 当日任务

- 实现查询文本 Embedding
- 实现 Qdrant Top-K 检索
- 增加相似度阈值过滤
- 格式化来源信息
- 支持“无结果时直接返回”

建议产出：

- `backend/src/query/embed-query.ts`
- `backend/src/query/retriever.ts`
- `backend/src/query/source-mapper.ts`

### 验收标准

- 输入问题后可以返回 Top-K 候选片段
- 相似度低于阈值的结果会被过滤
- 无召回结果时不调用 LLM
- 返回结果中包含 `source_path`、`section_title`、相似度

---

## 第 7 天：Prompt 组装与回答生成

### 当日任务

- 实现上下文拼装模块
- 编写符合需求文档的 Prompt 模板
- 调用 `Qwen2.5:7b` 生成回答
- 支持流式输出
- 串联完整查询服务

建议产出：

- `backend/src/query/prompt-builder.ts`
- `backend/src/llm/chat-client.ts`
- `backend/src/service/chat-service.ts`

### 验收标准

- 检索结果可正确拼装成上下文
- LLM 能基于上下文返回回答
- 回答附带来源信息
- 当资料不足时，模型输出“不足以回答”类结果
- 本地完成一次“提问 -> 检索 -> 生成 -> 返回”的完整链路

---

## 第 8 天：API 服务与端到端联调

### 当日任务

- 实现 `POST /api/chat`
- 实现 SSE 流式响应
- 定义 `delta`、`sources`、`done`、`error` 事件
- 增加基础请求校验
- 完成 CLI 或 HTTP 层联调

建议产出：

- `backend/src/server/app.ts`
- `backend/src/server/routes/chat.ts`
- `backend/src/server/sse.ts`

### 验收标准

- 接口可接收 `question` 请求
- 浏览器或 curl 可收到 SSE 流式输出
- 回答结束后可收到来源列表
- 异常情况下可返回 `error` 事件
- 端到端联调成功

---

## 第 9 天：文件监听、增量更新与异常补强

### 当日任务

- 实现目录监听
- 支持创建、修改、删除事件处理
- 增加启动时全量扫描
- 完善异常日志与状态落库
- 优化索引与查询中的边界情况

建议产出：

- `backend/src/ingest/watcher.ts`
- `backend/src/ingest/bootstrap-index.ts`
- 日志与错误码补充

### 验收标准

- 新增文件后能自动触发索引
- 修改文件后能自动更新向量与台账
- 删除文件后能删除对应向量与台账
- 服务重启后可自动补扫遗漏文件
- 失败文档状态可在台账中定位

---

## 第 10 天：测试、验收与文档收口

### 当日任务

- 编写关键单元测试和集成测试
- 对照需求文档逐项验收
- 补充 README 与运行说明
- 整理已知问题与后续优化项
- 做一次完整演示验证

建议产出：

- `backend/tests/` 或 `backend/src/**/*.test.ts`
- `README.md`
- 验收记录文档

### 验收标准

- 至少覆盖切块、解析、状态机、检索四类关键逻辑
- 能完成“导入文档 -> 提问 -> 返回答案”的演示
- 回答效果明显优于不带检索的纯模型回答
- 系统可在本地离线运行
- 数据更新后可以重新索引并生效

---

## 4. 阶段验收口径

在第 10 天结束时，建议按以下口径判断第一阶段是否完成：

- 能导入一批 `md` 文档和 `txt` 文档
- 能通过 API 或 CLI 发起问题查询
- 能返回基于本地资料的回答
- 回答附带来源信息
- 文件新增、修改、删除可驱动索引更新
- 全部能力可在本地离线环境下运行

如果以上 6 项全部满足，可以视为第一阶段开发完成。

---

## 5. 风险与缓冲建议

按每天 4 小时估算，最容易拖慢进度的点有：

- `Ollama` 本地模型加载与响应速度不稳定
- `Qdrant embedded` 的 TypeScript 接入细节需要摸索
- 文件监听在不同目录层级下的边界情况较多
- SSE 流式输出联调可能比预期更耗时

因此建议预留以下缓冲策略：

- 如果第 5 天未完全打通入库链路，第 6 天优先继续补齐，不急于进入生成模块
- 如果第 8 天 SSE 联调较慢，可先提供非流式接口，确保主功能先可用
- 如果第 10 天测试不完整，优先保证核心链路验收，其次再补测试覆盖

---

## 6. 一句话总结

按每天 4 小时推进，这个项目的第一阶段可以按 `10 天 / 40 小时` 规划，优先完成“索引、检索、生成、接口、增量更新”五条主线，并以端到端可运行作为最核心验收标准。
