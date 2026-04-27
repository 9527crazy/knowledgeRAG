# 已知问题（Bug / 改进项）

> 用于记录系统已发现但暂未修复的问题、根因分析、复现方式与缓解办法。
> 修复后请将条目从"未修复"小节移动到"已修复"小节并附上提交链接。

## 未修复

### B-001 默认 `similarity_threshold = 0.7` 偏严，常见提问被误判为空召回

- **现象**：在前端「对话」中输入 `3月份做了哪些工作。根据week report` 后，回答永远是兜底文案
  「资料中未找到与该问题直接相关的内容，无法据此作答。可尝试调整问题表述，或检查知识库是否包含相关文档。」
- **复现**：
  1. 知识库中至少包含 `backend/knowledge/week report/2026-03-27周报.md`、`2026-03-06周报.md` 等中文周报。
  2. `bun run src/index.ts` 启动后端（默认配置）。
  3. `curl -N -H "Content-Type: application/json" -d '{"question":"3月份做了哪些工作。根据week report"}' http://localhost:3000/api/chat`
- **直接根因**：向量层**已经召回**正确文档，但所有候选 score < 0.7 被
  [backend/src/query/retriever.ts](backend/src/query/retriever.ts):128–140
  的本地阈值兜底过滤清零；`runRetrieval` 返回 `empty: true`，
  [backend/src/service/chat-service.ts](backend/src/service/chat-service.ts):36–41
  走短路输出 `EMPTY_FALLBACK_TEXT`。
- **真实分数（用 Qdrant REST + Ollama 复测）**：

  | source | top-1 score |
  | --- | --- |
  | `week report/2026-03-27周报.md` | 0.6172 |
  | `week report/2026-03-06周报.md` | 0.5878 |
  | `rag-overview.md` | 0.5665 |

  对照其他改写：

  | 提问 | top-1 score |
  | --- | --- |
  | 本周完成的主要工作有哪些 | 0.6735 |
  | 851 软件项目进展 | 0.6712 |
  | 三月份的周报内容 | 0.5405 |
  | 周报里有哪些工作 | 0.5726 |

  当前 corpus 的相似度天花板约 0.65–0.68，0.7 默认值导致绝大多数自然语提问空召。
- **加重原因（语义层）**：
  1. 文档里写的是 `2026-03-27` / `20260306周报` / `本周完成的主要工作`，**没有"3 月份"或"3 月"自然语**；`bge-m3` 不会自动把日期等价为月份名词。
  2. 文件名（含 `2026-03-XX`）只参与 `doc_title` / `source_path`，**不进入 chunk_text**，对向量相似度几乎无贡献。
  3. 用户问题里的 `week report` 与文档里的 `周报` 在 `bge-m3` 上中英对齐相似度通常落在 0.55–0.65。
  4. 概括性提问 ↔ 具体业务陈述（851 软件、161 设备等）在多语 embedding 下天然存在 gap。
  5. 03-13 / 03-20 周报为 0 字节空文件，被 `min_chunk_length=50` 过滤后产生 0 chunks，进一步削弱"3 月份"主题召回面。
  6. 周报均使用 `**…**` 加粗而非 ATX (`#`) 标题，
     [backend/src/ingest/parsers/markdown.ts](backend/src/ingest/parsers/markdown.ts):75–86
     将整篇视为单 section，`section_title` 为空串，无法在召回/排序中提供层级提示。
- **临时缓解**：
  - 启动后端时 `export SIMILARITY_THRESHOLD=0.55`（按当前数据估计可让 03-06/03-27 周报命中）。
  - 提问改写为贴近文档原文，例如「2026-03 周报里本周完成的主要工作有哪些」。
  - 给周报加 ATX 标题与"月份/类型"等元信息行，把"3 月""week report / 周报"等概念写入 chunk_text。
- **建议修复**：
  1. 把默认 `similarity_threshold` 调到 `0.55`（或按 `top_k` 自适应 fallback：先按高阈值，全部空召时降阈值再试一次）。
  2. 在 chunker 里把文件名 / 相对路径 / `doc_title` 拼到 chunk 文本头部，提升路径关键词召回。
  3. 在 [docs/rule.md](docs/rule.md) / `frontend/README.md` 中提示阈值默认值不适合短文档，给出经验值 0.5–0.65。
- **影响范围**：所有用户自然语提问 → MVP 体感「问什么都答不出」。

---

### B-002 reindex 后 Qdrant 出现同一 chunk 重复存储，`total_chunks` 虚高

- **现象**：`/api/status` 报 `total_chunks: 33`，但其中存在大量内容完全相同、score 相同的 chunk。直接查 Qdrant：

  ```text
  score 0.6172  ×6 (同一 chunk 复制了 6 份)
  score 0.5878  ×7
  score 0.5665  ×7
  score 0.4293  ×5
  …  共 33 个 points
  ```

- **复现**：对同一个文件多次触发 watcher 更新或 `POST /api/reindex`（含 doc_id），观察 Qdrant collection 的点数随次数线性增长，未随源文档实际 chunk 数收敛。
- **疑似根因**：update 路径在 upsert 之前没有按 `source_path` / `doc_id` 删除旧 chunk。需要核对：
  - [backend/src/store/vector-repository.ts](backend/src/store/vector-repository.ts) `upsert*` / `deleteBySourcePath`
  - [backend/src/ingest/index-pipeline.ts](backend/src/ingest/index-pipeline.ts) 在 update 分支是否调用 `deleteBySourcePath`
  - [backend/src/ingest/reindex.ts](backend/src/ingest/reindex.ts) 入口
- **影响范围**：
  - 检索 Top-K 在阈值降低后会被重复 chunk 占满，挤掉其他文档；
  - `/api/status.total_chunks` 不可信；
  - 长期跑下去 Qdrant 体积膨胀。
- **临时缓解**：删除 `backend/data/qdrant/` 与 `backend/data/ledger.db` 后冷启动重建索引。
- **建议修复**：
  1. update 分支统一用 "先 `deleteBySourcePath` 再 `upsertChunks`" 的顺序；
  2. 在写入端使用稳定的 chunk_id（基于 `doc_id + chunk_index + content_hash`），而不是 `randomUUID`，让重复写入天然幂等；
  3. 增加单测：对同一文档连续两次 `indexDocument`，断言 collection 点数等于第一次。

---

### B-003 Qdrant 数据丢失后 bootstrap 仅对比 ledger.content_hash，永久跳过重建

- **现象**：调低 `SIMILARITY_THRESHOLD` 到 0.45 仍然 `retrieval empty`：

  ```text
  [bootstrap-index] details={"scanned":6,"add":0,"update":0,"remove":0,"skip":6,...} bootstrap done
  [query] details={"top_k":6,"similarity_threshold":0.45} retrieval empty
  [chat-service] chat short-circuit (empty retrieval)
  ```

- **现场**：

  ```bash
  curl -s http://127.0.0.1:6333/collections/knowledge_chunks | jq .result.points_count
  # 0

  curl -s http://localhost:3000/api/status
  # {"total_docs":5,"total_chunks":0,"failed_docs":0,"indexing_docs":1,...}
  ```

  即 **Qdrant collection 已被清空（`points_count=0`），但 SQLite ledger 里仍有 5 条 `done` + 1 条 `indexing` 记录**。

- **根因**：
  [backend/src/ingest/index-state-machine.ts](backend/src/ingest/index-state-machine.ts) 的 `buildIndexPlan` 只对照
  `ledger.content_hash` 与文件当前 hash：内容未变 → `skip`。它**没有核对 Qdrant 中是否真的存在该 doc 的向量**。
  因此当 Qdrant 因任何原因丢点（手动删 `data/qdrant/`、collection 被重建、磁盘损坏、迁移环境等），bootstrap
  仍报 `add=0/update=0/skip=N`，业务上**永远无法自愈**。
- **额外症状**：本次 status 还报 `indexing_docs: 1`——上次 reindex 过程中断后，对应 ledger 行卡在 `indexing` 状态，
  没有任何流程把它推回 `done` 或 `failed`。
- **影响范围**：
  1. 任何"Qdrant 数据丢失而 ledger 未同步重置"场景都会导致系统陷入"哑火"——前端永远看到兜底文案；
  2. 与 `B-001` 叠加时极易误诊为"阈值不够低"，实际无论怎么改都救不回来；
  3. `/api/status.total_chunks` 与 `total_docs` 出现严重不一致（`5 docs / 0 chunks`），但目前没有任何告警或自检。
- **临时缓解（任选其一）**：
  1. **冷启动重建**（最稳）：

     ```bash
     # 在 backend/ 目录下
     pkill -f "bun run src/index.ts"          # 或在终端 Ctrl+C
     rm -rf data/qdrant data/ledger.db        # 清掉两端，强制全量
     bun run src/index.ts                     # 启动后会扫到所有文件并 add
     ```

  2. **保留 Qdrant、只重置 ledger**：

     ```bash
     rm data/ledger.db
     bun run src/index.ts
     ```

  3. **保留 ledger、只让所有 doc 走重建**：用 sqlite3 把 `document_index` 表里所有 `status='done'` 改为 `'failed'`，
     再 `POST /api/reindex {}` 触发"重建失败项"分支。
- **建议修复**：
  1. **bootstrap 必须做一次健康核对**：如果 Qdrant `points_count == 0` 但 ledger 里有 `done` 行，
     应将所有 `done` 行降级为 `failed`（或直接 plan 成 `update`），强制重建。
  2. **`indexing` 残留检测**：bootstrap 启动时把所有 `status='indexing'` 的行视为脏数据，统一回退到 `failed`，避免永远卡住。
  3. **状态机增加 chunk 计数核对**：`buildIndexPlan` 在判断 `skip` 之前，
     对照 ledger 行的 `chunk_count` 与 Qdrant 中以 `source_path` 过滤的实际点数，不一致 → `update`。
  4. **状态接口加自检字段**：`/api/status` 返回 `coherent: total_chunks > 0 || total_docs == 0`，前端在
     "索引状态"页用 M3 Banner 显式提示用户"Qdrant 与 ledger 不一致，建议重建"。

---

### B-004 `bun --watch` 重启时不杀旧进程，并发持有 SQLite WAL 导致 ledger 损坏

- **现象**：`bootstrap` 抛 `LedgerError: 初始化 SQLite 台账表失败`，但 `data/ledger.db` 看起来"是新建的"。
  ```text
  ERROR [bootstrap-index] code=BOOTSTRAP_INDEX_FAILED
    cause=LedgerError: 初始化 SQLite 台账表失败
        at ensureSchema (.../store/ledger.ts:114:19)
  ```
- **复现现场**：
  ```bash
  ps -ef | grep "bun --watch run src/index.ts" | grep -v grep
  # 8 个并存进程：11:11、11:19、11:19、13:26、13:58、14:00、14:01、14:02
  sqlite3 backend/data/ledger.db "PRAGMA integrity_check;"
  # Error: disk I/O error
  ```
- **根因**：`backend/package.json` 里 `dev` 脚本用 `bun --watch run src/index.ts`。在
  [backend/src/store/ledger.ts](backend/src/store/ledger.ts):65–78 我们对 SQLite 开启了
  `journal_mode = WAL`。多个 watch 副本同时打开 `ledger.db` 时会抢同一个 `-wal`/`-shm`，文件互相覆写，
  最终 `CREATE TABLE IF NOT EXISTS` 的写入也会失败。
  - `bun --watch` 在 macOS 上有时无法干净地终止旧子进程（fork 出的 child 仍持有 socket 与文件句柄）；
  - 我们的 `Bun.serve` 在 `startServer` 抛错时也不会自动 `close()`，所以哪怕 bootstrap 失败，
    旧实例仍然 `listening :3000` 抢着端口。
- **影响**：
  - SQLite 损坏后 `ensureSchema` 直接抛 `LedgerError`，bootstrap 永远进不去；
  - 端口 `3000` 被僵尸进程占住，新实例报 `Failed to start server. Is port 3000 in use?`；
  - 与 [B-003](#b-003-qdrant-数据丢失后-bootstrap-仅对比-ledgercontent_hash永久跳过重建) 叠加时极易误判为"代码 bug"。
- **临时缓解（实测可用的恢复 runbook）**：
  ```bash
  # 1) 杀掉所有 bun 实例（包括 --watch 出来的子进程）
  pkill -9 -f "bun --watch run src/index.ts"
  pkill -9 -f "bun run src/index.ts"

  # 2) 双端清理（注意：data/qdrant 在本仓库其实是 Qdrant docker 容器的挂载点！）
  rm -rf backend/data/ledger.db backend/data/ledger.db-wal backend/data/ledger.db-shm
  docker restart <qdrant_container_name>   # gifted_benz 之类
  curl -s -X DELETE http://127.0.0.1:6333/collections/knowledge_chunks  # 若仍残留

  # 3) 启动一个普通 bun 进程（不要 --watch），观察是否 add=N
  cd backend
  SIMILARITY_THRESHOLD=0.55 bun run src/index.ts
  ```
- **建议修复**：
  1. 把 `dev` 脚本默认从 `bun --watch run` 改为 `bun run`，并在 README 提示：本项目持有
     SQLite + Qdrant + 文件 watcher 三类长期资源，不适合 hot-reload。需要重启时手动 Ctrl+C 再起。
  2. 在 [backend/src/index.ts](backend/src/index.ts) 入口的 SIGINT/SIGTERM handler 里增加
     `pidfile` 互斥（启动时若发现 pidfile 存在且进程还活着则 `process.exit(1)` 并提示）。
  3. 在 `startServer` 抛错时显式 `close()`：当前 [backend/src/server/app.ts](backend/src/server/app.ts):102–119
     的 `Bun.serve` 一旦端口冲突会抛错跳出，但前面已经创建的 ledger / watcher 没有被回收。
  4. SQLite 打开后增加 `pragma_check` 心跳（如启动时 `PRAGMA integrity_check`），不通过则直接终止启动并指导用户清理。

---

### B-005 `data/qdrant` 同时是 Qdrant docker 容器的挂载点，命名/角色易误删

- **现象**：在排查 [B-003](#b-003-qdrant-数据丢失后-bootstrap-仅对比-ledgercontent_hash永久跳过重建)
  时按"清缓存"思路 `rm -rf backend/data/qdrant`，结果 Qdrant 立即返回：
  ```text
  Service internal error: failed to create directory `./storage/.deleted`: No such file or directory
  ```
  对应 docker 容器：
  ```text
  docker run -p 6333:6333 \
    -v /Users/.../backend/data/qdrant:/qdrant/storage \
    qdrant/qdrant
  ```
  即 `data/qdrant/` 不是后端的本地缓存，而是 **Qdrant 服务自己的持久化目录**，被 docker `-v` 挂进了
  `/qdrant/storage`。删除会摧毁 Qdrant 的 segment / collection 元数据。
- **根因**：
  1. [backend/src/config/defaults.ts](backend/src/config/defaults.ts):25 把 `qdrant_path` 默认设为
     `"./data/qdrant"`，从命名看像是"客户端本地缓存"，实际只用于 `mkdir`，对 HTTP REST 客户端无意义。
  2. README / docs 里没有强调这个目录是 docker 挂载点，新人很容易把它当作"可清空"的本地数据。
- **影响**：
  - 误删后所有 collection 永久丢失；
  - 与 [B-004](#b-004-bun---watch-重启时不杀旧进程并发持有-sqlite-wal-导致-ledger-损坏) 叠加排查时
    很容易"先清 ledger 再清 qdrant"，把 Qdrant 容器存储一并端掉。
- **临时缓解**：
  ```bash
  # 误删后立即：
  docker restart <qdrant_container>     # 让容器 entrypoint 重建空 storage
  curl http://127.0.0.1:6333/collections # 应返回 collections=[]
  # 然后清 ledger 让 backend 全量重建即可
  ```
- **建议修复**：
  1. 把后端配置里这个字段重命名为 `qdrant_local_storage` 或直接去掉（HTTP REST 客户端用不到）；
     若保留，仅在嵌入模式启用。
  2. 在 root README 与 [README.md](README.md) 的"端到端验收"小节加显眼的红色提示：
     **`backend/data/qdrant/` 是 Qdrant docker 容器的 `-v` 挂载点，未停容器前不要 `rm -rf` 它。**
  3. 健康检查脚本 [backend/src/scripts/health-check.ts](backend/src/scripts/health-check.ts)
     增加一条："`/collections/<name>` 能正常响应 + `points_count` 与 ledger 一致"，作为冷启动验证项。

---

## 已修复

（暂无）

---

## 记录规范

新增 bug 时建议遵循以下结构：

- `### B-编号 一句话标题`
- 现象 / 复现 / 根因 / 真实数据（如有）/ 影响范围 / 临时缓解 / 建议修复
- 文件引用使用相对仓库根的 markdown 链接，必要时带行号区间
- 修复后将条目整体移动到"已修复"，并补充：修复 commit、PR 链接、回归测试入口
