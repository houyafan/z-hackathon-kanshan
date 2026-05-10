# 刘看山 LLM 三件套合围设计稿

归档时间：2026-05-10
范围：R3 评论 LLM 辅助 + R4 关注动态 LLM 总结 worker + 旅行手账分享卡
依据需求：`docs/product-requirements-v1.2.md` §八 (R3 / R4) + 黑客松交付目标
设计目标：在不破坏 P0/P1 现有闭环的前提下，把项目唯一缺失的 LLM 互动场景一次性补齐，形成「AI 替你写评论 / 替你扫关注 / 替你出门玩」的三角闭环

---

## 0. 决策快照

| 决策点 | 选择 | 备注 |
| --- | --- | --- |
| 总体架构 | 抽 `pet_llm.py` 共享层 + 三件套子模块（方案 B） | 同时把现有旅行手札 LLM 调用迁移过来 |
| R3 评论入口 | 全文弹窗评论区 | 推荐流卡片"评论"按钮跳转到全文弹窗并聚焦 |
| R3 评论奖励 | 必须输入文字且提交才奖励 | PRD 强制；点赞/收藏的一键起金保留 |
| R3 建议形态 | 流式打字 1 条 | SSE 转发火山方舟 stream |
| R3 编辑/重生成 | 可编辑、可重新生成；同 (user, content) 互斥 | 跨文章可并发 |
| R4 触发时机 | sync 入库后 daemon 异步 | 与现有旅行手札一致 |
| R4 总结粒度 | 两层：逐条 + 聚合一句 | 单条总结入 `zhihu_follow_moment.llm_summary`；聚合一句存独立表 |
| 手账分享卡 | 前端 html2canvas 截图 | 9:16 长图，Three.js 场景截图作主背景 |
| 卡片视觉构成 | 主题出场图 + LLM summary + 1 条 highlight + IP 小尾 | 二维码占位指向 `https://www.zhihu.com/` |
| 失败兜底 | 全链路 graceful degradation | 任一 LLM 失败都不阻塞旅行 / 关注 / 评论主流程 |

---

## 1. 架构与文件布局

### 1.1 文件树（新增 / 修改）

```
p0_mock/
├── server.py            修改：新增 R3/R4/分享卡路由，把现有 travel LLM 调用迁到 PetLLM
├── pet_llm.py           新增：LLM 抽象层（chat_json / chat_stream / run_async）
├── prompts/             新增：prompt 文件目录
│   ├── travel_handbook.md       从 server.py 抽离的现有 prompt
│   ├── comment_assist.md        R3：刘看山口吻评论建议
│   ├── follow_moment_each.md    R4 第一层：单条动态总结
│   └── follow_moment_overview.md R4 第二层：聚合一句话提醒
├── tests/               新增：unittest 烟雾测试
│   ├── test_pet_llm.py
│   ├── test_comment_assist.py
│   └── test_follow_overview.py
└── static/
    ├── app.js           修改：评论框 UI、流式接收、关注气泡升级、分享卡入口
    ├── styles.css       修改：评论框、AI 建议气泡、分享卡样式
    └── share_card.js    新增：html2canvas 截图 + Three.js 场景截图合成

3d-liukanshan-roaming/
└── roaming-character.js 修改：renderer 加 preserveDrawingBuffer:true，新增 captureSceneSnapshot()

db/sqlite/
└── init_p0.sql          修改：新增 pet_comment_assist_log、pet_follow_moment_overview，
                              zhihu_follow_moment 加 llm_retry_count/llm_error 两列

docs/superpowers/specs/
└── 2026-05-10-llm-trio-design.md  本文档
```

### 1.2 `pet_llm.py` 抽象层接口

```python
class PetLLM:
    def __init__(self, config: dict):
        # 读 VOLC_API_KEY / config.json，缺失时启动 demo fallback 模式
        ...

    def chat_json(
        self,
        prompt_name: str,
        payload: dict,
        *,
        timeout_sec: float = 8.0,
        expected_keys: list[str],
    ) -> dict:
        """渲染 prompts/{prompt_name}.md，调用火山方舟 response_format=json_object，
        返回 dict；HTTP/网络错误自动重试 1 次（500ms 间隔）；失败 raise LLMError。"""

    def chat_stream(
        self,
        prompt_name: str,
        payload: dict,
        *,
        timeout_sec: float = 15.0,
        max_chars: int = 100,
    ) -> Iterator[str]:
        """yield 增量文本片段；超过 max_chars 后强制截断。"""

    def run_async(self, name: str, fn: Callable[[], None]) -> None:
        """daemon 线程跑 fn，异常吞到 logger 不抛出。"""
```

prompt 文件用 `{{var}}` 模板，`pet_llm.py` 用 `str.replace` 渲染（不引外部依赖）。
prompt 头部加 `# version: 2026-05-10-1` 注释，调用时把版本号写入 `*_log.model` 字段（如 `ep-xxx@2026-05-10-1`），方便事后回查。

### 1.3 三件套与抽象层关系

```
server.py
├── /api/p1/comment/assist   (SSE) ──→ PetLLM.chat_stream("comment_assist", ...)
├── /api/p1/comment/submit   (POST) ─→ 写 pet_comment_assist_log + 触发原内容事件
├── /api/p1/comment/discard  (POST) ─→ 仅修状态
├── /api/p0/follow-moments/sync ────→ PetLLM.run_async(summarize_pending_moments)
│                                      └→ chat_json("follow_moment_each") × N
│                                      └→ chat_json("follow_moment_overview") × 1
├── /api/p0/follow-moments/overview (GET) ──→ 查 pet_follow_moment_overview by batchId
├── /api/p0/follow-moments/overview/consume (POST) ──→ 标记 consumed_at
├── /api/p1/travel/start (现有) ─────→ PetLLM.run_async(summarize_travel_handbook)
│                                      └→ chat_json("travel_handbook")  ← 迁移
└── /api/p1/travel/handbook/{id}/share-payload ──→ 返回卡片所需结构化数据
```

---

## 2. 数据模型变更

### 2.1 新增表 `pet_comment_assist_log`（R3）

```sql
CREATE TABLE IF NOT EXISTS pet_comment_assist_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  prompt_payload TEXT NOT NULL,            -- 输入 LLM 的 JSON 字符串
  suggested_comment TEXT DEFAULT NULL,     -- 流式累积完成的最终建议
  status TEXT NOT NULL DEFAULT 'streaming',-- streaming / ready / failed / used / discarded
  model TEXT DEFAULT NULL,
  final_comment TEXT DEFAULT NULL,         -- 用户实际提交的内容（可被编辑过）
  used_as_is INTEGER NOT NULL DEFAULT 0,   -- 是否一字不差使用
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_comment_assist_user_content
  ON pet_comment_assist_log(user_id, content_id);
```

状态机：

```
streaming  ─(SSE 完成)→  ready  ─(用户提交)→  used
    │                      │
    │                      └─(用户关弹窗)→  discarded
    │
    └─(流中断 0 chunk)→  failed
```

不做 UNIQUE 约束（同一篇允许多次重新生成）。
`used_as_is` 用于产品数据分析。

### 2.2 修改表 `zhihu_follow_moment`（R4 重试列）

```sql
ALTER TABLE zhihu_follow_moment
  ADD COLUMN llm_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE zhihu_follow_moment
  ADD COLUMN llm_error TEXT DEFAULT NULL;
```

PRD §（六）.3 已经提示要补。`init_p0.sql` 同步加这两列；`server.py` 启动时的 `migrate_*` 系列函数加 `migrate_follow_moment_retry_columns()`，沿用现有"先 PRAGMA table_info 检查，再 ALTER"的幂等模式（参考 `server.py:351 migrate_travel_themes`）。

### 2.3 新增表 `pet_follow_moment_overview`（R4 第二层聚合）

```sql
CREATE TABLE IF NOT EXISTS pet_follow_moment_overview (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sync_batch_id TEXT NOT NULL,             -- 一次 sync 调用的 uuid
  overview_text TEXT NOT NULL DEFAULT '',  -- LLM 聚合一句话；failed/skipped 时为空字符串
  moment_count INTEGER NOT NULL,           -- 这次 sync 涵盖几条新动态
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','failed','skipped')),
  model TEXT DEFAULT NULL,
  consumed_at TEXT DEFAULT NULL,           -- 前端消费/展示后回填
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_follow_overview_user_unconsumed
  ON pet_follow_moment_overview(user_id, consumed_at);
```

为什么单独存表：聚合一句话不属于任何单条动态；分开存还能查"看山过去 N 次扫关注 tab 都说了什么"，演示价值高。

### 2.4 不动的表

- `pet_travel_handbook`：分享卡完全从已有 LLM 字段读取
- `pet_travel_external_content`：分享卡的 highlight 取 `llm_highlights[0]`
- `zhihu_content_pool` / `pet_content_event` / `pet_profile`：纯读，不改 schema

### 2.5 兼容策略

- `db/sqlite/init_p0.sql` 是幂等脚本，新建时用 CREATE TABLE
- `server.py` 启动时跑 `migrate_*` 全量幂等，已存在的表/列不再触发 ALTER

---

## 3. 三件套数据流

### 3.1 R3 评论辅助：完整时序

```
[1] 用户在全文弹窗里点击「让看山帮你想一句」
        ↓
[2] 前端 EventSource 连 GET /api/p1/comment/assist?content_id=...
        ↓
[3] server 路由：
    a. 校验登录
    b. 检查 (user_id, content_id) 是否有 streaming log，有则 UPDATE → discarded
    c. 拉 zhihu_content_pool（title/excerpt/full_content 截 500 字）
    d. INSERT pet_comment_assist_log status=streaming，记录 prompt_payload
    e. 起 SSE 响应头：Content-Type: text/event-stream
    f. PetLLM.chat_stream("comment_assist", payload) 逐 chunk yield
    g. 每收到一个 delta：send `data: {"chunk": "...", "id": <log_id>}\n\n`
    h. 每 5 秒 send `: ping\n\n` 心跳
    i. 流完，UPDATE log status=ready, suggested_comment=完整文本
    j. send `data: {"done": true}\n\n`，关闭连接
        ↓
[4] 前端实时把 chunk append 到评论输入框
        ↓
[5] 用户【一字不改提交】 / 【编辑后提交】 / 【放弃关闭】
        ↓
[6] 提交：POST /api/p1/comment/submit
    body: { assist_log_id, content_id, comment_text }
    a. 校验 comment_text 长度 6-200
    b. 与 suggested_comment 字面比对决定 used_as_is（去首尾空白后精确匹配）
    c. UPDATE pet_comment_assist_log status=used, final_comment, used_as_is
    d. 触发原 content-event 流（comment 行为，按现有奖励规则）
    e. INSERT pet_content_event
    f. 返回 { reward, profile, levelUp }
        ↓
[7] 用户关闭未提交：POST /api/p1/comment/discard?id=<log_id>
    UPDATE status=discarded
```

**重要联动**：现有 `app.js` 里 `data-interact data-action="comment"` 的一键起金路径下线，改为"点 → 打开全文弹窗并聚焦评论框"。like / collect 保留原行为。

### 3.2 R4 关注动态总结：完整时序

```
[1] 前端定时器或用户触发 POST /api/p0/follow-moments/sync
        ↓
[2] 现有逻辑：拉知乎 /user/moments，对比水位入库新动态，发养成奖励
        ↓
[3] 立即返回（不等 LLM）：
    server 端 batchId = uuid.uuid4().hex（与本次 sync 一一对应）
    body: { newCount, latestMoment, batchId, llm: { plannedCount, status: 'pending' } }
        ↓
[4] PetLLM.run_async("summarize_follow_moments_<batchId>", lambda):
    a. 取本批次新增的 zhihu_follow_moment（pending）+ 满足重试条件的 failed
    b. UPDATE 这批 status=processing
    c. 串行 chat_json("follow_moment_each") 每条一调，写回 llm_summary
       失败：status=failed, retry_count++, llm_error=<msg>
    d. 全部跑完后，把 ready 的所有 summary 喂给 chat_json("follow_moment_overview")
       INSERT pet_follow_moment_overview(sync_batch_id, overview_text)
    e. 全 ready 子集为空 → INSERT overview status=skipped
        ↓
[5] 前端轮询 GET /api/p0/follow-moments/overview?sync_batch_id=<batchId>
    （前端原本就有 syncFollowMoments 定时器，扩展为收到 batchId 后追问 overview）
        ↓
[6] 后端 ready 后返回：{ overviewText, momentCount, summaries: [{key, summary}] }
        ↓
[7] 前端：
    a. 刘看山气泡升级：从「有新动态去看看」→ overviewText（最多展 8 秒）
    b. 关注 tab 卡片 hover 时展示该条单独 summary
    c. POST /api/p0/follow-moments/overview/consume 标记 consumed_at
```

### 3.3 手账分享卡：完整时序

```
[1] 用户在手账弹窗点「分享这次旅行」按钮
        ↓
[2] 前端 share_card.js：
    a. 获取目标手账数据（已在 DOM 里）
    b. 调用 character.captureSceneSnapshot(theme)：
       - 临时切换场景背景色（极地深蓝 / 热点橙红）
       - renderer.render() 一帧
       - canvas.toDataURL('image/png') 拿到 base64
       - 还原原背景
    c. 注入背景到隐藏的 .share-card 容器（9:16, 750×1280px 固定）
    d. 容器内渲染：
        - 顶部 60% 高：3D 场景截图作 background-image，叠加主题文案
        - 中部 25% 高：summary
        - 中下 10% 高：highlight #1 (title + reason)
        - 底部 5%：刘看山小头像 + "知乎刘看山" 水印 + 二维码占位
    e. html2canvas(.share-card) → blob → URL.createObjectURL
    f. 弹出预览模态：右键保存图片 / 一键下载按钮
        ↓
[3] 后端零侵入（纯前端方案）
```

**3D 侧改动**：`roaming-character.js` 渲染器初始化要改 `preserveDrawingBuffer: true`（默认 false 会让 canvas 截图全黑）。这是唯一的 3D 侧改动。
新增 `captureSceneSnapshot(themeOverrides)` 公共方法。

---

## 4. 错误处理与边界

### 4.1 LLM 调用层（`pet_llm.py` 统一约定）

| 失败场景 | 处理 |
| --- | --- |
| HTTP 4xx 或非 5xx 网络异常 | raise `LLMError`，不重试 |
| HTTP 5xx / 连接超时 / DNS 失败 | 重试 1 次（500ms 间隔），仍失败则 raise |
| 返回非 JSON | raise `LLMError`，由调用方判断兜底 |
| 返回 JSON 但缺 `expected_keys` | raise `LLMError` |
| 单次超时（默认 8s 同步 / 15s 流式） | 终止，调用方落 failed |
| API key 缺失 | 启动时 print warning，整链路降级为 mock 文案（`LLM_DEMO_FALLBACK=true`） |
| stream 中途断流 | 已 yield 的 chunk 视为最终值，UPDATE status=ready；0 chunk 时 status=failed |

### 4.2 R3 评论辅助

| 场景 | 处理 |
| --- | --- |
| 同篇连点重新生成 | 旧 log discard，新 log 接管 |
| 跨篇并发 | 允许（user_id+content_id 互斥而非全局互斥） |
| 已对同 content 提交过评论再生成 | 不阻拦（多次评论是正常使用） |
| 提交空字符串或 <6 字 | 400 拒绝，toast「评论太短了，看山也想多说几句」 |
| 提交 >200 字 | 400 拒绝（流式建议本身限 100 字，此情况只在用户大量编辑时出现） |
| 字面比对决定 used_as_is | 去除首尾空白后精确字符串比较 |
| 流式断开前用户已开始编辑 | 前端不再 append；提交时按 final 文本发 |
| LLM 全挂 | SSE 路由开始时即降级，直接 send 兜底文案：「这题挺值得聊，我先放下评论框，主人想到啥写啥就好。」status=failed |

### 4.3 R4 关注动态总结

| 场景 | 处理 |
| --- | --- |
| 单条 LLM 失败 | retry_count++、updated_at=now、llm_error=<msg> |
| 重试调度 | 下次 sync 时，failed 项满足 `retry_count<3 AND now-updated_at >= 30 * 2^retry_count 秒` 才重置 pending；超 3 次置 skipped |
| Overview LLM 失败 | INSERT overview status=failed，前端 GET 时降级为「你关注的 N 个人有新动态」 |
| 单条全 failed → overview 无素材 | INSERT overview status=skipped，不调 LLM |
| 用户在 overview 没生成完时再次 sync | 新 batch 直接覆盖，旧 batch daemon 让它跑完但前端按 batchId 过滤不消费 |
| daemon 异常 | `pet_llm.run_async` 内部全套 try/except，logger 打印，任务消亡不影响主进程 |
| SQLite 写锁冲突 | 沿用现有 `BEGIN IMMEDIATE` + 30s busy_timeout |

### 4.4 手账分享卡

| 场景 | 处理 |
| --- | --- |
| 手账 LLM 还没 ready 就点分享 | 按钮 disabled，提示「等看山写完再分享～」 |
| 浏览器不支持 html2canvas（极少数老 IE） | 静默 fallback：显示「请截屏分享」+ 静态精美预览框 |
| 3D canvas `preserveDrawingBuffer=false` | 实施时强制改为 true，启动控制台打 log 验证 |
| 截图分辨率过高 | share-card 容器固定 750×1280，避免高 DPI 内存爆炸 |
| 用户在分享卡渲染过程中关弹窗 | 渲染是 detached DOM，无副作用 |

### 4.5 安全

- **Prompt injection**：手账素材已有 url 白名单（`normalize_zhihu_web_url`）+ "声明素材为受信内容"系统 prompt。R3/R4 prompt 复用同一防御段
- **R3 用户输入**：评论提交存 DB 前不走 HTML 转义（DB 不渲染），但前端展示评论时统一用 textContent 而非 innerHTML
- **R3 SSE 滥用**：(user_id, content_id) 维度互斥，旧 log 被新请求自动 discard，防 token 烧光
- **API 鉴权**：所有 R3/R4 路由复用 `require_auth`
- **content_id 校验**：必须存在于 zhihu_content_pool，否则 404；防止用户构造任意 content_id 让 LLM 帮写
- **LLM 输出长度强约束**：prompt 写明字数，server 端再做硬截断（comment 100 字 / each 70 字 / overview 80 字）

### 4.6 性能

- 单次评论辅助 LLM 流式：首字 ~500ms，全长 1-3s
- 单次 overview 调用：4-8s（5 条 summary 拼一起 ~600 token）
- daemon 并发上限：每 user 同时只 1 个 overview 任务在跑（用 `pet_follow_moment_overview.status=pending` 作锁标记）

---

## 5. 测试与验收

### 5.1 自动化测试

新增 `p0_mock/tests/`（stdlib unittest，无新依赖）：

```
tests/
├── test_pet_llm.py             PetLLM 抽象层：mock urllib，验证 prompt 渲染、stream 累积、超时
├── test_comment_assist.py      R3 路由：mock PetLLM，跑 SSE → submit → 奖励链路
└── test_follow_overview.py     R4 daemon：mock PetLLM，跑 sync → daemon → overview ready
```

跑法：`python3 -m unittest discover p0_mock/tests`

### 5.2 手工验收清单

| 场景 | 验收口径 | 关联 |
| --- | --- | --- |
| **R3-A** 全文弹窗点 AI 辅助 | 输入框看到逐字打出，≤3s 出首字 | PRD R3 |
| **R3-B** 一字不改提交 | DB used_as_is=1，奖励正确发放，刘看山气泡反馈 | PRD R3 |
| **R3-C** 编辑后提交 | DB used_as_is=0，final_comment 为编辑后版本 | PRD R3 |
| **R3-D** 关闭弹窗未提交 | DB status=discarded，无奖励 | PRD R3 |
| **R3-E** 同篇连点重新生成 | 旧 log discarded，新 log 接管，UI 输入框清空重打 | 最佳实践 |
| **R3-F** 跨篇并发 | 文章 A、文章 B 两 tab 同时 AI 辅助互不干扰 | 最佳实践 |
| **R3-G** 一键起金路径下线 | 推荐流卡片"评论"按钮：跳转全文弹窗并聚焦评论框，不直接发奖 | PRD R3 |
| **R3-H** LLM 全挂 | SSE 立即返回兜底文案，输入框直接显示 | 错误处理 |
| **R3-I** 评论字数 <6 / >200 | 提交被拒，toast 提示 | 错误处理 |
| **R4-A** 同步上来 5 条新动态 | sync 接口 ≤500ms 立即返回；daemon 在 10-15s 内完成 5 条单条 + 1 条 overview | PRD R4 |
| **R4-B** Overview 气泡 | 刘看山气泡从「N 条新动态」升级为「你关注的 X 在聊…」 | PRD R4 |
| **R4-C** 关注 tab 卡片单条总结 | 卡片 hover 出现 LLM 单句总结 | PRD R4 |
| **R4-D** Overview 失败 | 气泡降级为旧版兜底 | 错误处理 |
| **R4-E** 单条 3 次失败 | DB status=skipped，关注卡片 hover 走旧兜底 | 错误处理 |
| **R4-F** 同步无新动态 | 不调用 LLM，无 overview 写入 | 边界 |
| **手账-A** 旅行归来手札展示 LLM 总结 | summary + pet_quote + 3-5 highlights | PRD R2（已完成） |
| **手账-B** 点分享按钮 | 1-2s 内出现预览图，含 3D 主题图 + summary + 1 highlight | 新增 |
| **手账-C** 保存图片 | 文件名 `liukanshan-{theme}-{travelId}.png`，720×1280 | 新增 |
| **手账-D** LLM 未 ready 时点分享 | 按钮 disabled + 提示 | 错误处理 |
| **回归-A** 旅行手札迁移到 PetLLM 后 | 现有旅行流程零回归（仍 8-14s ready） | 不破现有 |
| **回归-B** 关注同步现有奖励 | 每条 +2exp/+1mood、单批上限不变 | 不破现有 |
| **回归-C** OAuth + mock 双模式 | 两种 auth_mode 下三件套都能跑 | 不破现有 |

### 5.3 Demo 脚本（黑客松现场 5 分钟）

```
00:00  打开 / ：知乎主站推荐流，刘看山悬浮
00:20  点击文章「为什么普通人面对 AI 红利也会犹豫？」→ 全文弹窗
00:30  ★ 点「让看山帮你想一句」→ 评委看到流式打字
00:55  一字不改提交 → 刘看山气泡反馈 +3exp +8mood，等级条动一下
01:15  切到「关注」tab → 没新内容
01:20  ★ 点「同步关注动态」（或自动定时触发）
01:25  评委看到："已同步 5 条新动态"
01:40  10-15 秒后刘看山气泡升级："你关注的青山布衣等 3 人最近在聊 AI 红利…"
       （演示话术：解说"daemon 异步给关注内容做两层 LLM 总结"，遮蔽等待）
01:55  hover 关注卡片 → 单条 LLM 总结浮出
02:10  点击悬浮卡的「出门游历」→ 极地 / 热点 二选一
02:20  60 秒等待（解说技术：daemon 异步 LLM）
03:20  归来 → 手札弹窗：summary + pet_quote + highlights
03:40  ★ 点「分享这次旅行」→ 9:16 卡片
04:00  保存图片，朋友圈视角讲完
04:10-05:00  Q&A
```

### 5.4 演示风险预案

| 风险 | 预案 |
| --- | --- |
| 现场无网络 → LLM 全挂 | 配置开关 `LLM_DEMO_FALLBACK=true`，所有 LLM 调用走预录文案，但保留流式打字效果 |
| OAuth 回调地址在评委环境失败 | `auth_mode=mock`，预填演示用户 |
| 知乎热榜接口超时 | 现有 fallback_hot_items 已在；同步关注用预灌入的 zhihu_follow_moment 种子数据 |
| html2canvas 加载失败 | 走 `<picture>` srcset 同款图占位 + 用户右键保存 |
| Three.js preserveDrawingBuffer 影响性能 | 实测对 60fps 影响 <2%；如有问题，仅在 share-card 触发时临时打开，截完关闭 |

---

## 6. 不在本设计范围内

明确划清边界，避免 scope 蔓延：

- 健康值衰减、休眠唤醒（B 路径，留下个迭代）
- 社交串门、互助、排行榜
- 权益与道具（盐选体验卡、挂件）
- 性能降级开关（动画关闭、极简模式）
- 真实知乎评论 API 提交（社区 API 走另一套签名体系，PRD 已明确）
- 手账分享卡的真实分享渠道（朋友圈/微博 API 集成）

---

## 7. 落地顺序建议

1. 先做 PetLLM 抽象层 + 迁移现有旅行手札 LLM 调用（保证不破回归）
2. R4 daemon worker（链路最短，复用旅行模式）
3. R3 评论辅助（涉及前后端最多改动，但有最大 demo 价值）
4. 手账分享卡（纯前端 + 一处 3D 改动）
5. 自动化测试 + 手工回归
6. Demo 脚本演练 + 风险预案验证

详细的实施步骤将在下一阶段由 writing-plans 产出。

---

## 8. 依赖与配置

- 不引入任何新 Python 三方依赖（继续 stdlib only）
- 前端引入 1 个第三方 JS：`html2canvas` 1.4.x，通过 CDN 引入（评委环境无网络时 fallback 为提示截屏）
- `p0_mock/config.json` 新增字段：

```json
{
  "llm_demo_fallback": false,
  "llm_models": {
    "default": "ep-xxxxxxxxxx",
    "comment_assist": "ep-xxxxxxxxxx"
  }
}
```

`llm_models.default` 缺失时 fallback 到现有 `volc_endpoint_id`；`llm_demo_fallback=true` 时所有 LLM 调用走预录文案（demo 兜底）。
