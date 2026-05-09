# 关注动态 LLM 总结对接 README

归档时间：2026-05-08  
范围：关注动态总结 -> 刘看山气泡提醒  
当前状态：已预留数据模型，暂未接真实 LLM 调用

## 1. 目标

当前系统已经能通过知乎 OAuth `GET /user/moments` 同步用户关注动态，并在发现新动态时让刘看山提醒用户查看“关注”tab。

下一步接入 LLM 后，提醒会从：

```text
你关注的人有新动态，去关注 tab 看看
```

升级为：

```text
你关注的青山布衣刚赞同了关于 AI 红利的回答，主要在讨论普通人如何低成本参与新技术机会。
```

## 2. 已有数据模型

表：`zhihu_follow_moment`

关键字段：

| 字段 | 说明 |
| --- | --- |
| `user_id` | 知乎用户 uid |
| `moment_key` | 动态去重 key |
| `actor_name` | 动态发起人 |
| `action_text` | 动作，如回答了问题、赞同了回答 |
| `action_time` | 动态时间 |
| `target_title` | 内容标题 |
| `target_excerpt` | 内容摘要 |
| `target_author_name` | 内容作者 |
| `raw_payload` | 原始动态 JSON |
| `llm_summary_status` | `pending/processing/ready/failed/skipped` |
| `llm_summary` | LLM 生成的摘要 |
| `llm_summary_model` | 使用的模型 |
| `llm_summary_updated_at` | 摘要更新时间 |
| `notified_at` | 刘看山是否已提醒 |

## 3. 状态流转

```text
同步关注动态
-> 插入 zhihu_follow_moment
-> llm_summary_status = pending
-> LLM worker 拉取 pending 动态
-> processing
-> 调用 LLM
-> ready / failed
-> 前端 sync 接口返回 ready 摘要
-> 刘看山气泡展示摘要
-> mark-notified
```

建议失败重试：

```text
failed 可在 10 分钟后重新置为 pending
连续失败 3 次可置为 skipped
```

当前表里还没有 `retry_count`，如要做完整重试，可以补充：

```sql
ALTER TABLE zhihu_follow_moment ADD COLUMN llm_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE zhihu_follow_moment ADD COLUMN llm_error TEXT DEFAULT NULL;
```

## 4. Worker 职责

建议新增后台任务或接口触发函数：

```text
summarize_pending_follow_moments(limit=20)
```

处理流程：

1. 查询 `llm_summary_status = 'pending'` 的动态。
2. 将其更新为 `processing`，避免重复处理。
3. 从字段组装 LLM 输入。
4. 调用 LLM 生成一句适合刘看山气泡展示的摘要。
5. 写回 `llm_summary`、`llm_summary_model`、`llm_summary_updated_at`。
6. 成功置为 `ready`，失败置为 `failed`。

查询示例：

```sql
SELECT *
FROM zhihu_follow_moment
WHERE llm_summary_status = 'pending'
ORDER BY action_time DESC, id DESC
LIMIT :limit;
```

写回示例：

```sql
UPDATE zhihu_follow_moment
SET llm_summary_status = 'ready',
    llm_summary = :summary,
    llm_summary_model = :model,
    llm_summary_updated_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = :id;
```

## 5. LLM 输入格式

建议只给必要信息，避免把完整原始 JSON 都塞给模型。

```json
{
  "actor_name": "青山布衣",
  "action_text": "赞同了回答",
  "action_time": 1778234875,
  "target_title": "为什么普通人面对 AI 红利也会犹豫？",
  "target_excerpt": "每一代人都会在时代机会面前犹豫。真正重要的不是每一次红利都押中，而是在变化刚发生时，愿意用低成本的方式去理解它。",
  "target_author_name": "知乎用户"
}
```

## 6. 输出要求

LLM 输出建议固定为 JSON，便于服务端校验。

```json
{
  "summary": "青山布衣关注了一个关于 AI 红利的讨论，重点是普通人如何低成本理解新机会。"
}
```

约束：

- `summary` 控制在 30-60 个中文字符。
- 不要编造 `target_excerpt` 里没有的信息。
- 不要输出 Markdown。
- 不要输出“根据内容可知”等模型腔。
- 如果内容不足以总结，返回更朴素的提醒。

兜底输出：

```json
{
  "summary": "你关注的人有一条新动态，去关注 tab 看看。"
}
```

## 7. 推荐提示词

```text
你是知乎虚拟宠物刘看山的关注动态总结助手。

任务：
把一条知乎关注动态总结成一句自然、轻量、适合气泡展示的话。

要求：
1. 只基于输入字段总结，不要编造。
2. 语气像刘看山提醒用户，不要像系统通知。
3. 30-60 个中文字符。
4. 不要 Markdown。
5. 只输出 JSON：{"summary":"..."}。

输入：
{moment_json}
```

## 8. 前端消费方式

当前前端函数：

```javascript
followMomentMessage(data)
```

已有逻辑：

```text
如果 data.llm.summary 存在
-> 刘看山气泡追加 summary
否则
-> 使用 actor/action/title 的普通提醒
```

后端 `POST /api/p0/follow-moments/sync` 当前返回：

```json
{
  "newCount": 3,
  "latestMoment": {
    "actorName": "青山布衣",
    "actionText": "赞同了回答",
    "targetTitle": "问题标题",
    "llmSummaryStatus": "ready",
    "llmSummary": "青山布衣关注了一个关于 AI 红利的讨论。"
  },
  "llm": {
    "summaryPlanned": true,
    "summaryStatus": "ready",
    "summary": "青山布衣关注了一个关于 AI 红利的讨论。"
  }
}
```

## 9. 接口建议

P0 阶段可以先用内部接口手动触发：

```http
POST /api/internal/follow-moments/summarize
Content-Type: application/json
```

请求：

```json
{
  "limit": 20
}
```

返回：

```json
{
  "processed": 18,
  "ready": 16,
  "failed": 2
}
```

进入正式任务后建议改为定时 worker：

```text
每 1-5 分钟处理 pending 动态
每次最多处理 20-50 条
失败动态延迟重试
```

## 10. 验收标准

| 场景 | 预期 |
| --- | --- |
| 新关注动态入库 | `llm_summary_status = pending` |
| worker 成功总结 | 状态变为 `ready`，写入 `llm_summary` |
| worker 失败 | 状态变为 `failed`，不影响关注动态提醒 |
| 前端收到 ready 摘要 | 刘看山气泡展示摘要内容 |
| 无摘要 | 刘看山使用普通关注 tab 提醒 |
| 摘要过长/非 JSON | 服务端丢弃并使用兜底文案 |

