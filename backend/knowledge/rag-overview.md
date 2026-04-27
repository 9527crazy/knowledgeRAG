# RAG 知识库系统概览

本文档用于第 6 天检索模块的端到端验收，提供足够长度的内容以保证在 `chunk_size=500`、`min_chunk_length=50` 配置下可生成至少一个有效切片，并确保查询侧 Top-K、阈值过滤、来源映射、空结果短路均可被实际触发并复现。

## 1. 系统目标

本地知识库 RAG 系统的核心目标，是把本地 Markdown 与纯文本资料按段落切分、向量化后写入 Qdrant，并在用户提问时进行向量检索、阈值过滤、来源拼装与回答生成。整套流程不依赖云服务，所有计算在本机完成，便于个人知识沉淀与离线问答。

系统在第 4～5 天完成了文件扫描、Markdown / Plain Text 解析、按 token 边界切分、调用 Ollama 嵌入模型生成 1024 维向量、写入 Qdrant 并在 SQLite 中记录索引状态等能力。第 6 天的检索模块负责把这一整套写入路径反向打开：把用户问题向量化后送入 Qdrant，返回 Top-K 候选并应用相似度阈值，最后映射成稳定的 `Source` 结构供第 7 天 Prompt 拼装使用。

## 2. 检索流程

第 6 天的检索流程被刻意设计成几个边界清晰的小模块。

第一步是查询侧嵌入。`createQueryEmbedder(config)` 复用写入侧已存在的 `createEmbedder` 实现，自动获得 1024 维校验、3 次重试与 120 秒超时；查询侧只在最外面增加“非空 question”的输入校验，保证空字符串会以 `ValidationError` 形式失败而不是把空向量送给下游。

第二步是 Qdrant Top-K 检索。`createRetriever(config)` 内部用与写入侧相同的 `DEFAULT_QDRANT_URL` 建立客户端，调用 `client.search(collection, { vector, limit: top_k, score_threshold })` 完成相似度搜索。返回结果除了由服务端按 `score_threshold` 过滤之外，本地再做一次 `score >= similarity_threshold` 的兜底过滤，并对 payload 做最小窄化：缺关键字段的候选直接跳过并 `log.warn`。

第三步是来源映射。`mapCandidateToSource` 把 `RetrievalCandidate` 中的 `payload` 字段映射成对外稳定的 `Source` 结构，包括 `source_path`、`section_title`、`score` 这三项必备字段，以及 `source_name`、`doc_title`、`doc_type`、`chunk_id`、`chunk_text` 等给第 7 天 Prompt 拼装使用的扩展字段。

第四步是空结果短路。`runRetrieval` 是薄编排器：当过滤后的候选数为 0 时，直接返回 `{ candidates: [], sources: [], empty: true }` 并记录一条 INFO 日志，第 7 天接入 LLM 时就可以凭借 `empty` 字段直接短路而不发起任何模型调用。

## 3. 配置项

整个检索模块的关键行为由 `app.config.json` 控制：`top_k` 决定每次搜索返回多少候选；`similarity_threshold` 决定最低可接受的余弦相似度；`embedding_model` 与 `embedding_dimensions` 决定向量空间；`qdrant_collection_name` 决定使用哪个集合。第 6 天验收文档建议把 `SIMILARITY_THRESHOLD` 临时调高到 `0.99` 来稳定触发空结果场景，从而验证短路路径可以被复现。

## 4. 模块边界

第 6 天严格遵守一个原则：不修改 ingest 与 store 层任何已稳定的代码，所有新增逻辑都进 `backend/src/query/` 目录。这一边界让第 6 天的实现可以与第 5 天的索引管线并行验证，也为第 7 天的 Prompt 拼装与第 8 天的 SSE 事件定义了稳定的数据契约：`RetrievalResult.empty` 与 `Source` 形状即为后续模块的输入。

## 5. 与其他天的衔接

第 7 天会基于本文档描述的 `Source` 结构构建 Prompt，并在 `empty: true` 时跳过 LLM 调用、直接返回兜底回复。第 8 天会把 `sources` 数组作为 SSE 事件的一部分推送给前端。第 9 天的文件监听更新会复用第 5 天的索引管线，不再回到检索路径。这样的分层让每一天的工作都拥有独立的验收边界，避免后续阶段“顺手改”早期模块。
