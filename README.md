# knowledgeRAG

一个本地运行的 RAG 知识系统，用于把本地文档索引为可检索知识库，并基于检索结果生成带来源引用的回答。

项目当前处于第一阶段规划与实施准备期，目标是先跑通“文档入库 -> 向量检索 -> LLM 生成 -> API 返回”的最小闭环。

## 项目目标

- 本地文档索引：接入 `md`、`txt` 文档并构建知识库
- 本地语义检索：基于向量召回相关片段
- 检索增强问答：仅依据检索内容生成回答
- 来源可追溯：回答附带来源文件、章节和相似度信息
- 全链路本地运行：不依赖外部 API 和云服务

## 技术选型

第一阶段采用以下技术方案：

| 模块 | 选型 |
| --- | --- |
| 运行时 | `Bun + TypeScript` |
| 生成模型 | `Qwen2.5:7b` |
| 向量模型 | `bge-m3` |
| 模型服务 | `Ollama` |
| 向量存储 | `Qdrant embedded` |
| 索引台账 | `SQLite` |

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
│   └── plan/
│       └── 1.md
└── backend/                     # 后端代码项目入口（待实现）
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

说明：当前仓库主要包含规划与设计文档，`backend/` 仍在按分日计划逐步落地。

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

## 文档导航

- [需求文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/requirement.md)
- [RAG 技术原理](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/rag-principle.md)
- [开发环境文档](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/development-environment.md)
- [代码编写计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/coding-plan.md)
- [第 1 天实施计划](/Users/liushuai/codeFliles/github/knowledgeRAG/docs/plan/1.md)

## 预期运行环境

- macOS
- `Bun >= 1.1`
- 已安装并运行 `Ollama`
- 已拉取模型：
  - `qwen2.5:7b`
  - `bge-m3`

未来 `backend/` 初始化完成后，预期启动方式如下：

```bash
cd backend
bun install
bun run dev
```

## 当前状态

仓库当前已完成：

- 需求文档整理
- RAG 原理说明
- 开发环境约定
- 第一阶段编码计划
- 第 1 天实施细化文档

下一步将进入 `backend/` 项目骨架初始化与基础配置模块落地。
