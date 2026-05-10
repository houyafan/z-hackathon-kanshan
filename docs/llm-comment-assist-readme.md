# 评论辅助 LLM 对接 README

归档时间：2026-05-10
范围：评论辅助流式生成 → 用户编辑提交 → 触发养成奖励
当前状态：已完成（实测可工作，含模板兜底）

## 1. 目标

PRD §（八）.R3：用户在内容全文弹窗的评论编辑器里点击「让看山帮你想一句」按钮时，服务端通过火山方舟 OpenAI 兼容流式接口生成一段刘看山口吻的评论建议，前端逐字 append 到 textarea。用户可一字不改提交、可编辑后提交、也可放弃关闭。

效果：

```text
点击「让看山帮你想一句」
-> 后端 SSE: data: {"chunk":"看","id":42}
-> 前端实时打字到 textarea
-> done 事件携带完整文本
-> 用户编辑或不编辑提交
-> POST /api/p1/comment/submit
-> 触发原内容事件 reward
```

## 2. 数据模型

表：`pet_comment_assist_log`

```sql
CREATE TABLE pet_comment_assist_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  prompt_payload TEXT NOT NULL,
  suggested_comment TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'streaming'
    CHECK (status IN ('streaming','ready','failed','used','discarded')),
  model TEXT DEFAULT NULL,
  final_comment TEXT DEFAULT NULL,
  used_as_is INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

关键字段：

| 字段 | 说明 |
| --- | --- |
| `prompt_payload` | LLM 输入 JSON（content title / excerpt / 截 500 字正文片段） |
| `suggested_comment` | 流式累积完成的最终建议（≤ 100 字） |
| `status` | 状态机：streaming → ready → used / discarded；中途失败置 failed |
| `final_comment` | 用户实际提交的内容（可能编辑过） |
| `used_as_is` | 是否一字不差使用建议（用于产品数据分析） |

## 3. 状态流转

```text
点击「让看山帮你想一句」
-> 服务端 INSERT pet_comment_assist_log status='streaming'
-> 同时把同 (user, content) 旧 streaming log 改 'discarded'（互斥）
-> SSE 开始向前端推 chunk
-> 流完: status='ready', suggested_comment 入库
-> 用户提交: POST /comment/submit
   -> 比对 final == suggested 决定 used_as_is
   -> status='used'
   -> 触发 apply_content_event(action='comment')
-> 用户关闭未提交: POST /comment/discard
   -> status='discarded'
-> LLM 全失败: status='failed', suggested_comment 用兜底文案
```

## 4. 接口

### `GET /api/p1/comment/assist?content_id=X` (SSE)

事件流：

```
data: {"chunk":"看","id":42}\n\n
data: {"chunk":"到","id":42}\n\n
: ping\n\n
data: {"done":true,"id":42,"text":"看到这些…"}\n\n
```

LLM 失败时：

```
data: {"chunk":"这题挺值得聊…","id":42,"fallback":true}\n\n
data: {"done":true,"id":42,"text":"…","fallback":true}\n\n
```

互斥规则：(user_id, content_id) 维度；旧 streaming log 在新请求开始时被 discard。
心跳：每 5s 一条 `: ping\n\n` 注释帧防代理掐断。

### `POST /api/p1/comment/submit`

请求：

```json
{
  "contentId": "article_ai_bonus_001",
  "commentText": "看完这篇我觉得…",
  "assistLogId": 42
}
```

校验：长度 6-200 字，content_id 必须存在于 `zhihu_content_pool`。

响应（成功）：

```json
{
  "reward": {"exp": 3, "satiety": 0, "mood": 8, "levelUp": false},
  "profile": {...},
  "usedAsIs": false,
  "assistLogId": 42
}
```

错误码：`MISSING_FIELDS / COMMENT_TOO_SHORT / COMMENT_TOO_LONG`，均 400。

### `POST /api/p1/comment/discard`

请求：`{"assistLogId": 42}`，响应 `{"ok": true}`。
仅修改状态，不影响奖励。

## 5. LLM 输入格式

服务端组装（见 `serve_comment_assist_sse` in `p0_mock/server.py`）：

```json
{
  "content_id": "article_ai_bonus_001",
  "content_type": "article",
  "title": "为什么普通人面对 AI 红利也会犹豫？",
  "excerpt": "每一代人都会在时代机会面前犹豫……",
  "full_content_excerpt": "（截 500 字正文片段）"
}
```

字段长度上限：title ≤80、excerpt ≤200、full_content_excerpt ≤500。

## 6. 输出要求

LLM 流式返回纯文本（非 JSON，因为流式 + json_object 互斥）。
服务端硬截断 100 字符（参见 `PET_LLM.chat_stream(... max_chars=100)`）。

文案约束（详见 `p0_mock/prompts/comment_assist.md`）：
- 40-100 个中文字符
- 刘看山口吻：温和、好奇、不攻击
- 不要 Markdown / 列表 / "看山觉得"模板腔
- 不要客服 / 营销号 / 模型助手语气
- 直接输出评论文本，不要前缀后缀、不要包裹引号

## 7. 失败兜底

| 场景 | 处理 |
| --- | --- |
| LLM_API_KEY 缺失 | SSE 立即推送兜底文案 + done(fallback=true)，status=failed |
| 网络超时 / 5xx | 同上 |
| 流中途断开但已 yield ≥1 chunk | status=ready，已 yield 文本作为最终值 |
| 流中途断开且 0 chunk | status=failed + 兜底文案推送 |
| 服务进程崩溃 | log 留存 streaming，重启后清理（可加 cron 把 streaming > 5min 的置 discarded） |

兜底文案：「这题挺值得聊，我先放下评论框，主人想到啥写啥就好。」

## 8. 前端消费方式

入口：`renderContentModal` 内附加 `renderCommentEditor(content)`。

关键文件：`p0_mock/static/app.js`
- `bindCommentEditor(modalRoot)` — textarea 字数计数 + AI 按钮 EventSource 接入
- `_activeCommentAssist` — 当前活跃 SSE 句柄（旧请求被新请求 abort）
- `discardActiveCommentAssist()` — modal 关闭时调用

UI 状态机：

```text
初始: AI 按钮可点，submit 禁用（textarea 空）
点 AI: AI 按钮 disabled, "看山在写..."；submit 强制 disabled (aiStreaming=true)
chunk 到: textarea append, 字数计数更新
done 到: AI 按钮变"换一句"；aiStreaming=false; submit 按字数判断启用
提交成功: submit "已提交 ✓" + showReward 反馈; textarea 清空
关闭 modal: discardActiveCommentAssist 关 SSE + POST /discard
```

## 9. 接入新 LLM 模型 / 切换 endpoint

修改 `p0_mock/config.json`:

```json
{
  "llm": {
    "api_url": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    "api_key": "...",
    "model": "ep-xxxxxxxxx",
    "demo_fallback": false
  }
}
```

或用环境变量：`VOLC_API_KEY` / `LLM_MODEL` / `LLM_API_URL`。

`demo_fallback=true` 时 `chat_stream` 改用预录文案（`pet_llm.py:_DEMO_FALLBACKS["comment_assist"]`），仍逐字模拟 streaming（每字 40ms），保留 demo 视觉效果。

## 10. Prompt 维护

文件：`p0_mock/prompts/comment_assist.md`
头部 `# version: 2026-05-10-1`，调用时带入 `model_tag = ep-xxxx@2026-05-10-1`，写到 `pet_comment_assist_log.model`，方便事后回查哪条评论用了哪版 prompt。

修改 prompt 后请同步更新 version 号。

## 11. 验收标准

| 场景 | 预期 |
| --- | --- |
| 全文弹窗点 AI 辅助 | textarea 看到逐字打出，≤3s 出首字 |
| 一字不改提交 | DB used_as_is=1，奖励 +3 exp / +8 mood，刘看山气泡反馈 |
| 编辑后提交 | DB used_as_is=0，final_comment 为编辑后版本 |
| 关闭弹窗未提交 | DB status=discarded，无奖励 |
| 同篇连点重新生成 | 旧 log discarded，新 log 接管，textarea 清空重打 |
| 跨篇并发 | 文章 A、B 两 tab 同时 AI 辅助互不干扰 |
| 推荐流卡片"评论"按钮 | 跳转全文弹窗并聚焦 textarea，不直接发奖 |
| LLM 全挂 | SSE 立即返回兜底文案，textarea 直接显示 |
| 评论字数 <6 / >200 | 提交被拒，toast 提示 |
| 流式中尝试提交 | submit 按钮 disabled，无法提交 |
