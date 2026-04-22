# 开发环境文档

## 1. 文档目的

本文档用于说明本项目在本地开发、调试和运行所需的环境准备方式，帮助开发者快速搭建统一的开发环境。

本文档基于以下文档整理：

- [需求文档](./requirement.md)
- [RAG 技术原理](./rag-principle.md)

其中，具体技术选型与运行约束以 `requirement.md` 为准。

---

## 2. 项目定位

本项目是一个本地运行的 RAG 知识系统，目标是实现：

- 本地文档索引
- 基于语义检索召回相关内容
- 基于检索上下文生成回答

系统特点：

- 全部本地运行
- 不依赖外部 API
- 使用 `Bun + TypeScript`
- 使用 `Ollama` 承载本地模型
- 使用 `Qdrant embedded` 存储向量
- 使用 `SQLite` 维护索引台账

---

## 3. 开发环境基线

根据需求文档，推荐开发机基线如下：

| 项目 | 建议配置 |
| --- | --- |
| 操作系统 | macOS |
| 机器配置 | Mac M5 / 24GB 内存 / 1TB 存储 |
| 运行时 | Bun |
| 语言 | TypeScript |
| Node 兼容环境 | 可选，用于生态工具兼容 |
| 本地模型服务 | Ollama |

说明：

- 项目主运行时为 `Bun`
- 如果部分开发工具依赖 `Node.js`，可额外安装 LTS 版本作为辅助环境
- 所有核心推理与检索能力应在本机完成，不依赖云服务

---

## 4. 核心依赖

### 4.1 Bun

项目运行时采用 `Bun`，用于：

- 安装依赖
- 执行 TypeScript 代码
- 启动本地服务

建议版本：

- `bun >= 1.1`

安装完成后可通过以下命令验证：

```bash
bun --version
```

### 4.2 TypeScript

项目使用 `TypeScript` 进行开发，负责：

- 模块开发
- 类型约束
- 配置与服务逻辑实现

通常作为项目依赖安装，无需全局安装。

### 4.3 Ollama

`Ollama` 是本项目唯一需要单独运行的本地服务进程，负责：

- 提供大模型推理能力
- 提供 embedding 向量生成能力

默认服务地址：

- `http://localhost:11434`

安装完成后可通过以下命令验证：

```bash
ollama --version
ollama list
```

### 4.4 模型依赖

根据需求文档，项目使用以下本地模型：

| 用途 | 模型 |
| --- | --- |
| 生成模型 | `qwen2.5:7b` |
| 向量模型 | `bge-m3` |

首次使用前需要提前拉取：

```bash
ollama pull qwen2.5:7b
ollama pull bge-m3
```

### 4.5 Qdrant embedded

项目使用 `Qdrant embedded` 模式作为向量存储层：

- 无需单独启动独立数据库服务
- 通过 TypeScript SDK 在进程内使用
- 数据持久化到本地目录

默认数据目录：

- `./data/qdrant`（相对 `backend/` 项目根目录）

### 4.6 SQLite

项目使用 `SQLite` 保存索引台账：

- 记录文件 hash
- 记录索引状态
- 记录 chunk IDs
- 支持增量更新判断

默认数据库文件：

- `./data/ledger.db`（相对 `backend/` 项目根目录）

---

## 5. 推荐安装顺序

建议按以下顺序准备开发环境：

1. 安装 `Bun`
2. 安装 `Ollama`
3. 拉取本地模型 `qwen2.5:7b` 与 `bge-m3`
4. 安装项目依赖
5. 创建本地数据目录与配置文件
6. 启动 Ollama
7. 启动项目索引与查询服务

---

## 6. 本地目录约定

结合需求文档，推荐项目目录结构如下：

```text
/knowledgeRAG
├── docs/                        # 项目文档
└── backend/                     # 后端代码项目入口
    ├── config.ts                # 运行配置入口
    ├── src/                     # 源码目录
    │   ├── ingest/              # 文档索引模块
    │   ├── query/               # 查询模块
    │   ├── llm/                 # Ollama 调用封装
    │   ├── store/               # Qdrant / SQLite 封装
    │   ├── config/              # 配置加载
    │   └── server/              # HTTP API
    ├── data/                    # 本地运行数据
    │   ├── qdrant/              # 向量数据
    │   └── ledger.db            # SQLite 台账
    ├── knowledge/               # 本地知识源目录（示例）
    ├── package.json
    ├── bun.lock
    └── tsconfig.json
```

说明：

- `docs/` 用于放需求、原理、开发文档
- `backend/` 是后端代码项目入口，依赖安装、启动和调试均在该目录下进行
- `backend/data/` 用于运行时持久化数据
- `backend/knowledge/` 可作为本地测试知识库目录
- 若后续项目目录有调整，以实际代码结构为准

---

## 7. 环境变量与配置文件

项目要求所有可变参数集中配置，不直接写死在业务代码中。

推荐采用以下方式管理配置：

- `config/*.ts` 保存默认配置
- `.env` 保存本地环境差异项
- `config.local.json` 或 `app.config.json` 保存运行配置

以下相对路径默认以 `backend/` 项目根目录为基准。

建议首版至少包含以下配置项：

| 配置项 | 示例值 | 说明 |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 地址 |
| `LLM_MODEL` | `qwen2.5:7b` | 生成模型 |
| `EMBEDDING_MODEL` | `bge-m3` | 向量模型 |
| `SERVER_PORT` | `3000` | API 端口 |
| `QDRANT_PATH` | `./data/qdrant` | 向量库存储路径 |
| `LEDGER_PATH` | `./data/ledger.db` | SQLite 台账路径 |

知识源配置建议与需求文档保持一致：

```json
{
  "sources": [
    {
      "name": "default",
      "path": "./knowledge",
      "include": [".md", ".txt"],
      "recursive": true
    }
  ],
  "chunk_size": 500,
  "chunk_overlap": 80,
  "min_chunk_length": 50,
  "top_k": 6,
  "similarity_threshold": 0.7,
  "ollama_base_url": "http://localhost:11434",
  "llm_model": "qwen2.5:7b",
  "embedding_model": "bge-m3",
  "server_port": 3000,
  "qdrant_path": "./data/qdrant",
  "ledger_path": "./data/ledger.db"
}
```

---

## 8. 初始化步骤

以下为推荐的本地初始化流程。

### 8.1 安装依赖

```bash
cd backend
bun install
```

### 8.2 准备数据目录

```bash
cd backend
mkdir -p data/qdrant
mkdir -p knowledge
```

### 8.3 启动 Ollama

如果 Ollama 尚未运行，先启动本地服务。

```bash
ollama serve
```

可另开终端验证模型是否可用：

```bash
ollama list
```

### 8.4 启动项目

根据项目实际脚本命名，建议约定以下命令：

```bash
cd backend
bun run dev
```

如果索引与服务拆分，也可以约定：

```bash
cd backend
bun run ingest
bun run server
```

说明：

- 当前仓库尚未看到具体脚本定义，以上命令为推荐约定
- 实际落地时应以 `backend/package.json` 中的脚本为准

---

## 9. 开发调试建议

### 9.1 本地知识数据准备

建议在 `backend/knowledge/` 目录放入少量 `md` 和 `txt` 文件，先验证以下链路：

- 文件扫描是否正常
- 切块是否正常
- embedding 是否成功
- Qdrant 是否成功写入
- 查询是否能召回正确片段
- 大模型回答是否引用上下文

### 9.2 调试顺序

建议按以下顺序调试：

1. 先验证 `Ollama` 与模型可调用
2. 再验证单文件切块逻辑
3. 再验证 embedding 与入库
4. 最后联调查询与生成链路

### 9.3 日志建议

建议在开发阶段至少输出以下日志：

- 文件扫描日志
- 文件索引状态日志
- embedding 调用结果日志
- 检索 Top-K 结果日志
- prompt 长度日志
- LLM 请求耗时日志

---

## 10. 常见问题

### 10.1 Ollama 无法连接

排查方向：

- 确认 `ollama serve` 是否正在运行
- 确认配置中的 `OLLAMA_BASE_URL` 是否正确
- 确认本机端口 `11434` 未被阻塞

### 10.2 模型未下载

排查方向：

- 执行 `ollama list` 查看本地模型
- 如果缺失，重新执行：

```bash
ollama pull qwen2.5:7b
ollama pull bge-m3
```

### 10.3 向量库目录不存在

排查方向：

- 确认 `backend/data/qdrant` 已创建
- 确认程序对目录具有读写权限

### 10.4 索引未更新

排查方向：

- 检查 SQLite 台账中的文件 hash 是否变化
- 检查文件监听是否覆盖目标目录
- 检查文件扩展名是否在 `include` 白名单中

---

## 11. 最小可运行环境总结

如果只追求第一阶段跑通，最小开发环境可以概括为：

- 安装 `Bun`
- 安装 `Ollama`
- 拉取 `qwen2.5:7b`
- 拉取 `bge-m3`
- 准备一个本地知识目录
- 提供 `Qdrant embedded` 与 `SQLite` 的本地存储路径

满足以上条件后，就具备实现本地 RAG 核心链路的开发基础。
