## 本地知识系统 需求文档 v0.2

---

### 1. 项目背景与目标

### 1.1 背景

团队需要一套本地运行的知识检索系统，能够通过自然语言查询本地文档资料，基于检索内容生成准确回答。所有数据和计算在本机完成，不依赖外部 API 和云服务。

### 1.2 目标

- 第一阶段验证 RAG 核心链路可用性，快速跑通从文档入库到自然语言问答的完整闭环
- 为后续扩展能力（PDF、代码、混合检索、多集合、多轮对话）预留架构空间
- 全栈 TypeScript + Bun 运行时，符合团队技术栈，降低维护成本

### 1.3 范围说明

本文档描述第一阶段的完整需求。第二阶段功能在第 10 节列出，作为架构预留依据，不在本阶段实现。

---

### 2. 技术约束

| 约束项 | 决策 | 说明 |
| --- | --- | --- |
| 运行时 | Bun + TypeScript | 团队主力语言 |
| 大语言模型 | Qwen2.5:7b | Ollama 本地部署，HTTP 调用 |
| Embedding 模型 | bge-m3 | Ollama 本地部署，HTTP 调用 |
| 向量数据库 | Qdrant embedded 模式 | 官方 TS SDK，无需独立进程 |
| 索引台账 | SQLite | 轻量持久化，Bun 原生支持 |
| 外部服务依赖 | 仅 Ollama 本地进程 | 其余全部进程内运行，无网络出口 |
| 开发与运行机器 | Mac M5 24GB 1TB | Metal 加速推理，统一内存架构 |

---

### 3. 系统整体架构

### 3.1 模块构成

`┌─────────────────────────────────────────────────────┐
│                    本地知识系统                       │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌─────────────────┐  │
│  │ Ingest   │   │  Query   │   │   API Server    │  │
│  │ 文档索引  │   │  查询引擎 │   │   对外接口层    │  │
│  └────┬─────┘   └────┬─────┘   └────────┬────────┘  │
│       │              │                  │           │
│  ┌────▼──────────────▼──────────────────▼────────┐  │
│  │                Store 层                        │  │
│  │         Qdrant embedded  |  SQLite 台账        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │              Ollama（独立本地进程）              │  │
│  │         Qwen2.5:7b   |  bge-m3               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘`

### 3.2 数据流向

**索引流**

`配置文件指定目录
      ↓
文件监听（创建 / 修改 / 删除）
      ↓
台账 hash 比对（判断是否需要处理）
      ↓
文档解析 → 文本切块 → Embedding（Ollama HTTP）
      ↓
写入 Qdrant（向量 + Payload）
      ↓
写入 SQLite 台账`

**查询流**

`用户自然语言输入
      ↓
查询 Embedding（Ollama HTTP）
      ↓
Qdrant 向量检索（Top K）
      ↓
相似度阈值过滤
      ↓
Prompt 拼装（检索内容 + 用户问题）
      ↓
Qwen 推理（Ollama HTTP，流式）
      ↓
返回回答 + 来源引用`

---

### 4. 配置项设计

系统所有可变参数集中在单一配置文件中管理，不硬编码在业务逻辑中。

### 4.1 文档来源配置

用户通过配置文件指定一个或多个本地目录作为知识库来源。

| 配置项 | 类型 | 说明 |
| --- | --- | --- |
| sources | 数组 | 文档来源目录列表，支持多个路径 |
| sources[].path | 字符串 | 目录绝对路径或相对路径 |
| sources[].name | 字符串 | 来源别名，用于界面展示和日志标识 |
| sources[].include | 数组 | 文件扩展名白名单，如 `[".md", ".txt"]` |
| sources[].recursive | 布尔 | 是否递归监听子目录，默认 `true` |

### 4.2 索引参数配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| chunk_size | 500 | 每个文本块的字符数上限 |
| chunk_overlap | 80 | 相邻块之间的重叠字符数 |
| min_chunk_length | 50 | 低于此字符数的块丢弃 |

### 4.3 检索参数配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| top_k | 6 | 向量检索返回的候选块数量 |
| similarity_threshold | 0.7 | 相似度低于此值的结果丢弃 |

### 4.4 模型参数配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| ollama_base_url | [http://localhost:11434](http://localhost:11434/) | Ollama 服务地址 |
| llm_model | qwen2.5:7b | 推理模型名称 |
| embedding_model | bge-m3 | 向量模型名称 |
| llm_temperature | 0.1 | 推理温度，越低越严谨 |
| llm_max_tokens | 2048 | 单次回答最大 token 数 |

### 4.5 服务配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| server_port | 3000 | API 服务监听端口 |
| qdrant_path | ./data/qdrant | Qdrant 本地存储路径，路径基准为 `backend/` |
| ledger_path | ./data/ledger.db | SQLite 台账文件路径，路径基准为 `backend/` |

---

### 5. 文档索引模块（Ingest）

### 5.1 文件监听

- 系统启动时，根据配置文件中的 `sources` 列表，对每个指定目录启动文件监听
- 监听范围：目录及其所有子目录（递归）
- 监听事件：文件创建、文件内容修改、文件删除
- 过滤规则：仅处理 `include` 配置中指定扩展名的文件，其余文件忽略
- 系统启动时执行一次全量扫描，处理监听期间遗漏的变更（如系统离线期间新增的文件）

### 5.2 增量索引状态机

文件变更触发后，执行以下判断逻辑：

`文件创建 / 修改事件
        ↓
计算文件内容 MD5 hash
        ↓
查询 SQLite 台账
        ↓
├── 台账不存在该文件 → 【新增流程】
├── 台账存在，hash 一致 → 跳过，无需处理
└── 台账存在，hash 不同 → 【更新流程】

文件删除事件
        ↓
查询 SQLite 台账取出 chunk_ids
        ↓
【删除流程】`

**新增流程**

1. 台账写入记录，status 标记为 `indexing`
2. 执行文档解析 → 切块 → Embedding → 写入 Qdrant
3. 台账更新 chunk_ids、hash、indexed_at，status 标记为 `done`
4. 任一步骤失败：台账 status 标记为 `failed`，记录 error_msg

**更新流程**

1. 台账 status 标记为 `indexing`
2. 从台账取出旧 chunk_ids，批量删除 Qdrant 中对应向量
3. 执行文档解析 → 切块 → Embedding → 写入 Qdrant
4. 台账更新 chunk_ids、hash、indexed_at，status 标记为 `done`
5. 任一步骤失败：台账 status 标记为 `failed`，记录 error_msg，旧向量已删除不做回滚

**删除流程**

1. 从台账取出 chunk_ids
2. 批量删除 Qdrant 中对应向量
3. 删除台账记录

### 5.3 文档解析

**Markdown 文件**

- 按标题层级（`#` / `##` / `###`）解析文档结构
- 提取每个文本块所属的最近一级标题作为 `section_title`
- 子目录路径纳入 `section_title` 构成，规则如下：

`示例目录结构：
  docs/
  └── 产品手册/
      └── 功能说明/
          └── 搜索功能.md
              └── ## 高级过滤

section_title 结果：
  产品手册 / 功能说明 / 搜索功能 / 高级过滤`

- 子目录层级与文档内标题层级之间用 `/` 分隔，统一拼接为完整路径

**纯文本文件（TXT）**

- 无标题结构，`section_title` 取值为子目录路径（不含文件名）
- 若位于根目录下，`section_title` 为空字符串

### 5.4 文本切块

- 采用递归字符切割策略
- 切割优先级：`\n\n` → `\n` → `。` → `！` → `？` →
- 每个 chunk 在切块前自行生成 UUID，不依赖 Qdrant 自动生成
- 过滤掉字符数低于 `min_chunk_length` 的 chunk

### 5.5 Embedding

- 对每个 chunk 的 `chunk_text` 调用 Ollama bge-m3 接口生成向量
- 接口调用失败时重试 3 次，仍失败则整个文档标记为 `failed`
- 同一文档的所有 chunk 串行处理，避免并发请求压垮 Ollama

---

### 6. 查询模块（Query）

### 6.1 查询流程

1. 接收用户自然语言问题
2. 调用 Ollama bge-m3 对问题生成查询向量
3. 在 Qdrant 单一 Collection 中执行向量检索，取 Top K 结果
4. 过滤掉相似度低于 `similarity_threshold` 的结果
5. 若过滤后无结果，直接返回"资料中未找到相关内容"，不调用 LLM
6. 将通过过滤的 chunk 拼装为 Prompt 上下文
7. 调用 Ollama Qwen2.5:7b 生成回答，启用流式输出
8. 返回回答内容及来源引用信息

### 6.2 Prompt 设计原则

- 明确指示 LLM 仅根据提供的参考资料回答
- 明确指示资料不足时直接说明，不推测、不编造
- 参考资料中附带 `section_title` 和 `source_path`，便于 LLM 引用
- 第一阶段不携带历史对话轮次（无多轮上下文）

### 6.3 来源引用

每次回答需附带来源信息，包含：

- 来源文件路径（`source_path`）
- 所属章节标题（`section_title`）
- 相似度得分（供调试参考，界面可选择性展示）

---

### 7. 数据结构设计

### 7.1 Qdrant Payload（每个 chunk 的元数据）

| 字段 | 类型 | 说明 | 是否第一阶段使用 |
| --- | --- | --- | --- |
| doc_id | string | 文档唯一标识（文件路径 MD5） | ✅ |
| source_path | string | 原始文件完整路径 | ✅ |
| source_name | string | 来源别名（来自配置） | ✅ |
| doc_title | string | 文档标题（文件名，不含扩展名） | ✅ |
| doc_type | string | 文档类型：`md` / `txt` | ✅ |
| section_title | string | 子目录路径 + 文档内标题拼接 | ✅ |
| chunk_text | string | 块的文本内容 | ✅ |
| chunk_index | integer | 块在文档中的序号（从 0 开始） | ⏸ 预留 |
| total_chunks | integer | 文档总块数 | ⏸ 预留 |
| char_count | integer | 块字符数 | ✅ |
| indexed_at | integer | 索引时间戳（Unix ms） | ✅ |

### 7.2 SQLite 台账表结构（document_index）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| doc_id | TEXT PRIMARY KEY | 文档唯一标识（文件路径 MD5） |
| file_path | TEXT NOT NULL | 文件完整路径 |
| source_name | TEXT | 来源别名（来自配置） |
| file_hash | TEXT NOT NULL | 文件内容 MD5，用于变更检测 |
| chunk_ids | TEXT NOT NULL | JSON 数组，该文档所有 chunk 的 UUID |
| chunk_count | INTEGER | chunk 总数 |
| status | TEXT NOT NULL | `indexing` / `done` / `failed` |
| error_msg | TEXT | 失败原因，status 为 failed 时记录 |
| indexed_at | INTEGER | 最后一次成功索引的时间戳（Unix ms） |
| created_at | INTEGER | 台账记录首次创建时间戳（Unix ms） |

---

### 8. API 接口设计

### 8.1 对话接口

`POST /api/chat`

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| question | string | 是 | 用户自然语言问题 |

响应：SSE（Server-Sent Events）流式输出

SSE 事件定义：

| 事件类型 | 触发时机 | 数据内容 |
| --- | --- | --- |
| `delta` | LLM 逐步输出时 | `{ text: string }` |
| `sources` | 回答结束后 | `{ items: Source[] }` |
| `done` | 流结束 | 无数据 |
| `error` | 发生错误时 | `{ message: string }` |

Source 结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| source_path | string | 来源文件路径 |
| source_name | string | 来源别名 |
| section_title | string | 所属章节标题 |
| score | number | 相似度得分 |

### 8.2 知识库状态接口

`GET /api/status`

响应体：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| total_docs | number | 台账中文档总数（status=done） |
| total_chunks | number | 向量库中 chunk 总数 |
| failed_docs | number | 索引失败文档数 |
| indexing_docs | number | 正在索引中的文档数 |
| last_indexed_at | string | null | 最近一次成功索引时间（ISO 8601） |
| sources | SourceStatus[] | 各来源目录的独立统计 |

SourceStatus 结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| name | string | 来源别名 |
| path | string | 目录路径 |
| doc_count | number | 该来源下文档数 |

### 8.3 手动重索引接口

`POST /api/reindex`

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| doc_id | string | 否 | 指定文档 ID，不传则重跑所有 failed 文档 |

响应体：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| triggered | number | 触发重索引的文档数量 |

---

### 9. 目录结构

`knowledgeRAG/
├── docs/                        项目文档
│
└── backend/                     后端代码项目入口
    ├── config.ts                全局配置文件（用户编辑此文件）
    ├── package.json             Bun 项目清单
    ├── bun.lock                 依赖锁文件
    ├── tsconfig.json            TypeScript 配置
    │
    ├── src/
    │   ├── ingest/
    │   │   ├── watcher.ts       文件监听，事件分发
    │   │   ├── parser.ts        文档解析（MD 标题提取 / TXT 处理）
    │   │   ├── chunker.ts       文本切块
    │   │   └── indexer.ts       Embedding 调用 + Qdrant 写入 + 台账维护
    │   │
    │   ├── query/
    │   │   ├── retriever.ts     向量检索 + 相似度过滤
    │   │   ├── prompt.ts        Prompt 拼装
    │   │   └── generator.ts     LLM 调用 + 流式输出处理
    │   │
    │   ├── store/
    │   │   ├── qdrant.ts        Qdrant 客户端封装
    │   │   └── ledger.ts        SQLite 台账 CRUD 封装
    │   │
    │   ├── api/
    │   │   └── server.ts        HTTP API 服务（路由 + SSE）
    │   │
    │   └── shared/
    │       ├── types.ts         全局类型定义
    │       ├── hash.ts          MD5 工具函数
    │       └── logger.ts        日志工具
    │
    ├── data/
    │   ├── qdrant/              Qdrant 本地持久化存储（自动生成）
    │   └── ledger.db            SQLite 台账文件（自动生成）
    │
    └── knowledge/               默认知识库文档目录（可在配置中覆盖）`

---

### 10. 非功能需求

| 项目 | 指标 | 说明 |
| --- | --- | --- |
| 查询首 token 延迟 | ≤ 3s | Embedding + 检索阶段完成时间 |
| 单文档索引时间 | ≤ 5s | 1000 字以内文档，M5 本地 |
| 知识库规模 | ≤ 1000 篇文档 | 第一阶段设计上限 |
| 数据安全 | 全本地 | 无任何网络出口，Ollama 仅本机访问 |
| 日志 | 本地文件输出 | 记录索引操作、错误信息，不需要日志系统 |

---

### 11. 第二阶段预留事项

以下功能不在本阶段实现，但当前架构设计需保证可扩展：

| 功能 | 预留方式 |
| --- | --- |
| 多轮对话上下文 | `/api/chat` 请求体预留 `history` 字段，当前忽略 |
| 按主题分 Collection | Qdrant 封装层抽象 collection_name，当前硬编码单一值 |
| PDF 支持 | `doc_type` 字段已预留，parser 模块按 doc_type 路由不同解析器 |
| 代码文件支持 | 同上，切块策略按 doc_type 路由 |
| 混合检索（BM25 + 向量） | retriever 模块抽象为接口，当前实现纯向量，后续替换 |
| Parent-Child 双层索引 | `chunk_index` / `total_chunks` 字段已预留 |
| 索引失败自动回滚 | `status` 字段已预留，当前仅标记，后续实现补偿逻辑 |

---

### 12. 开放问题（已关闭）

| # | 问题 | 结论 |
| --- | --- | --- |
| Q1 | 多轮对话上下文？ | 第二阶段实现，当前单轮 |
| Q2 | 单集合还是多集合？ | 第一阶段单一 Collection |
| Q3 | 子目录结构是否反映到 section_title？ | 是，子目录路径 + 文档内标题拼接 |
| Q4 | 前端技术选型？ | 第一阶段不在范围内 |
| Q5 | 文档来源如何指定？ | 配置文件，支持多目录 |

---

*文档版本：v0.2 | 状态：已完成 | 下一步：模块详细设计*
