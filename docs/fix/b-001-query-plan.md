# knowledgeRAG 召回增强方案

## 1. 根因结论

B-001 的根因是 `similarity_threshold = 0.7` 偏严，相关文档的相似度分数落在 0.5~0.7 之间被卡掉。

**最小修复：** 将 `similarity_threshold` 从 0.7 调整为 0.5，B-001 直接解决。

以下方案是在此基础上的能力增强。

---

## 2. 索引侧：简化版 chunk 上下文头

只拼接稳定可得的字段，不做复杂派生：

```text
文档标题：xxx
文件名：xxx
相对路径：xxx
章节标题：xxx

原文：
...
```

### 字段来源

| 字段 | 来源 |
| --- | --- |
| 文档标题 | `doc_title`，缺失时用文件名兜底 |
| 文件名 | `source_path` basename |
| 相对路径 | `relative_path` |
| 章节标题 | `section_title` |

### 原则

- 只写能稳定获取的字段，无法获取时省略，不填空值。
- 头部保持简短，避免挤占正文 embedding 权重。
- `embedding_text` 和 `chunk_text` 第一版不拆字段，MVP 阶段直接复用 `chunk_text`。

### 改动模块

`backend/src/ingest/chunker.ts`

---

## 3. 查询侧：Query Planner

### 3.1 输出格式

```json
{
  "original_question": "3月份做了哪些工作。根据week report",
  "retrieval_queries": [
    "3月份做了哪些工作。根据week report",
    "2026-03 周报 本周完成的主要工作",
    "3月 周报 做了哪些工作",
    "week report 2026-03 work summary"
  ]
}
```

### 3.2 Prompt

```text
你是本地知识库的查询规划器，不要回答用户问题。
请把用户问题改写为 3 到 5 条适合向量检索的短查询。

要求：
1. 第一条必须保留原始问题。
2. 从时间、来源、意图、同义表达等角度改写，覆盖用户问题的关键约束。
3. 每条查询尽量短，贴近文档中可能出现的表达。
4. 不要编造原问题没有暗示的实体或时间。
5. 不要解释，只输出 JSON。

JSON 结构：
{
  "original_question": "...",
  "retrieval_queries": ["...", "...", "..."]
}
```

### 3.3 失败兜底

LLM 调用失败或 JSON 解析失败时，退回 `retrieval_queries = [original_question]`，执行单路检索，流程不中断，不报错给用户。

### 3.4 多路检索参数

| 参数 | 预设值 | 说明 |
| --- | --- | --- |
| 每路 top_k | 3 | 调试后可调整 |
| 子 query 上限 | 5 条 | |
| 合并去重后候选上限 | 10 条 | 按 chunk_id 去重，保留最高 score |
| 最终进入 Prompt | 5 条 | |

**去重规则：** 按 `chunk_id` 去重，同一 chunk 被多条 query 命中时，命中次数作为重排加权因子，保留最高 score 的同时记录命中次数。

### 3.5 改动模块

| 模块 | 改动 |
| --- | --- |
| `backend/src/query/query-planner.ts` | 新增：调用 LLM 生成检索 query 列表，解析 JSON，失败时兜底 |
| `backend/src/query/query-planner-prompt.ts` | 新增：维护 Prompt 模板 |
| `backend/src/query/retriever.ts` | 支持多 query 并行检索、去重、按命中次数加权重排 |
| `backend/src/service/chat-service.ts` | 在 `runRetrieval` 前调用 Query Planner |

---

## 4. 实施顺序

**阶段一（立即）：**

- 调整 `similarity_threshold` 为 0.5，关闭 B-001。

**阶段二（短期）：**

- 索引侧：简化版 chunk 上下文头。
- 查询侧：Query Planner + 多路并行检索 + 去重重排。

**阶段三（后续按需）：**

- 评估 `embedding_text` 与 `chunk_text` 拆字段。
- 根据调试结果调整 top_k 和进 Prompt 的上限。
- 延迟过高时针对具体场景分析优化。

---

## 5. 验收口径

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"question":"3月份做了哪些工作。根据week report"}' \
  http://localhost:3000/api/chat
```

**期望：**

- `sources` 包含 3 月周报相关文档。
- 回答能基于 3 月周报归纳工作内容。
- 以下变体问题也能正确命中：

```text
三月份的周报内容
3月周报里有哪些工作
week report 2026-03 work summary
2026-03 周报 本周完成的主要工作
```