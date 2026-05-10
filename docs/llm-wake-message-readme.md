# 唤醒/入睡文案 LLM 对接 README

归档时间：2026-05-10
范围：刘看山进入休眠 / 被唤醒的瞬间，LLM 生成一句口吻化文案
当前状态：已完成（异步 daemon 调火山方舟，模板兜底）

## 1. 目标

PRD §（四）.D + §（五.3）：
- 饱食度过低 / 健康过低 → 看山进入休眠 → 一句"我饿得只能先睡一会儿"的文案在气泡显示
- 阅读 3 条优质内容 → 看山被唤醒 → 一句"看山醒啦，又能陪主人看内容"的文案

让"养"循环带情感连接，不只是数值跳动。

## 2. 触发时机

```text
fetch_profile(conn, user_id)
-> apply_decay_catchup (扣 satiety/mood/health)
-> maybe_enter_sleep
   -> if satiety<=20 OR health<=30 AND wake_status='awake':
        UPDATE wake_status='sleeping'
        schedule_wake_message(user_id, "sleep")  ← LLM async
```

```text
apply_content_event (action_type in {read, watch})
-> maybe_progress_wake
   -> if wake_status='sleeping': wake_progress += 1
        if wake_progress >= 3:
          UPDATE wake_status='awake', satiety=max(50, ...), mood=max(50,...), health=max(60,...)
          schedule_wake_message(user_id, "wake")  ← LLM async
```

`schedule_wake_message` 起 daemon 线程跑 LLM，不阻塞主流程。

## 3. 数据模型

`pet_profile` 新增 4 列：

| 字段 | 说明 |
| --- | --- |
| `wake_status` | `'awake' \| 'sleeping'` |
| `wake_progress` | 0-3，sleeping 时累计的阅读条数 |
| `last_wake_message` | LLM 生成的最近一次入睡/唤醒文案 |
| `wake_message_at` | 文案生成时间 |

## 4. LLM 输入格式

```json
{"event": "sleep"}
```

或

```json
{"event": "wake"}
```

服务端 `schedule_wake_message(user_id, event)` 组装。极简，无其他字段。

## 5. LLM 输出

```json
{"message": "主人不在的时候，看山饿得只能先睡一会儿。"}
```

约束（详见 `p0_mock/prompts/wake_message.md`）：
- 20-40 个中文字符
- sleep：表达"饿了/困了/等主人回来"，不矫情、不责怪
- wake：表达"睡醒了/谢谢主人/又有力气陪你"，轻松感
- 仅输出 JSON

## 6. 兜底文案

LLM 失败时使用预录文案：

| event | 兜底文案 |
| --- | --- |
| sleep | 主人不在的时候，看山饿得只能先睡一会儿。 |
| wake | 看山醒啦，又能陪主人一起看内容了。 |

## 7. 前端消费

`applyWakeUI(profile)` 在 `syncCharacter()` 末尾调用：
- `profile.wakeStatus === 'sleeping'`：roamingCharacter 加 `.is-sleeping` class（grayscale + 半透明 + 影子淡化）+ 气泡显示 `lastWakeMessage`
- 从 sleeping 转 awake 的瞬间：播放 `playSpawnEffect({scaleMultiplier: 1.2})` + 气泡显示 wake 文案

LLM 是异步生成的，前端首次拿到 `wakeStatus='sleeping'` 时 `lastWakeMessage` 可能为空，applyWakeUI 兜底先显示模板文案，下一次 syncCharacter 拉到 LLM 文案后替换。

## 8. 验收标准

| 场景 | 预期 |
| --- | --- |
| 衰减后 satiety 跌到 ≤20 | wake_status 自动转 sleeping，DB last_wake_message 在 8s 内有值 |
| sleeping 状态尝试出门 | travel_block_reason 返回"看山在休眠中，先帮 ta 读 N 条内容唤醒" |
| sleeping 状态阅读 1 篇 | wake_progress=1, 仍 sleeping，互动奖励减半 |
| sleeping 状态读满 3 篇 | 自动唤醒，satiety/mood 回 50，health 回 60，气泡显示 wake 文案 |
| LLM 全挂 | last_wake_message 落兜底文案，前端正常显示 |
