# 刘看山虚拟宠物 P0 数据库模型方案

归档时间：2026-05-08  
数据库：SQLite  
阶段范围：P0 内容消费 + 刘看山升级

## 1. 已确认边界

P0 只做“内容消费驱动刘看山成长升级”，不做旅行能力。

本阶段输入事件包括：

- 互动类：点赞、评论、收藏
- 阅读类：文章、想法、视频、小说

本阶段不做防刷能力，默认上游传入的内容消费事件可被宠物系统接收和发奖。数据库仍保留事件记录和奖励状态，用于排查、统计和后续扩展。

经验模型采用“累计总经验决定等级”：

```text
current_level = max(level where required_total_exp <= pet_profile.total_exp)
```

产品形象固定为刘看山，不考虑多宠物或换 IP，因此全链路使用 `user_id` 作为主关联，不引入 `pet_instance_id`。

## 2. P0 表清单

```text
pet_profile        用户刘看山当前状态
pet_content_event  内容消费/互动事件记录
pet_growth_log     成长数值流水
pet_level_config   等级配置
pet_daily_stat     用户每日养成统计
zhihu_content_pool 推荐页内容池
zhihu_user         知乎 OAuth / 本地 mock 用户映射
zhihu_follow_moment      当前用户关注动态
zhihu_follow_moment_sync 关注动态同步水位
```

## 3. 枚举约定

### content_type

| 值 | 说明 |
| --- | --- |
| `article` | 文章 |
| `pin` | 想法 |
| `video` | 视频 |
| `novel` | 小说 |

### action_type

| 值 | 说明 |
| --- | --- |
| `read` | 阅读 |
| `watch` | 观看 |
| `like` | 点赞 |
| `comment` | 评论 |
| `collect` | 收藏 |

### reward_status

| 值 | 说明 |
| --- | --- |
| `pending` | 已记录但未发奖 |
| `granted` | 已发奖 |
| `ignored` | 已忽略 |

### stage

| 值 | 说明 |
| --- | --- |
| `cub` | 幼崽期 |
| `growing` | 成长期 |
| `adult` | 成年期 |
| `advanced` | 进阶形态 |

## 4. 表设计

### 4.0 用户表

当前 P0 已按 Hackathon Skill 安全边界重新接入知乎 OAuth：线上通过知乎授权建立内存会话，本地请求可使用 mock 用户预览。前端不再传可信 `userId`，所有养成写入都由服务端解析当前用户。

| 表 | 说明 |
| --- | --- |
| `zhihu_user` | 授权用户或本地 mock 用户基础信息，`uid` 唯一 |

### 4.1 pet_profile

一名用户一条刘看山当前状态。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `user_id` | INTEGER | 用户 ID，唯一 |
| `adopted` | INTEGER | 是否已领养，0/1 |
| `pet_name` | TEXT | 宠物昵称 |
| `level` | INTEGER | 当前等级 |
| `stage` | TEXT | 当前成长阶段 |
| `total_exp` | INTEGER | 累计总经验 |
| `satiety` | INTEGER | 学识值，0-100 |
| `mood` | INTEGER | 心情值，0-100 |
| `total_read_count` | INTEGER | 累计有效阅读次数 |
| `total_watch_count` | INTEGER | 累计有效观看次数 |
| `total_interaction_count` | INTEGER | 累计有效互动次数 |
| `last_growth_at` | TEXT | 最近一次成长时间 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 4.2 pet_content_event

记录内容消费和互动事件。P0 不做防刷，因此 `user_id + content_id + action_type` 不设置唯一约束，只建普通索引用于查询。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `event_id` | TEXT | 事件唯一 ID |
| `user_id` | INTEGER | 用户 ID |
| `content_id` | TEXT | 内容 ID |
| `content_type` | TEXT | 内容类型 |
| `action_type` | TEXT | 行为类型 |
| `completion_ratio` | REAL | 完读/完播比例，可空 |
| `duration_sec` | INTEGER | 停留/观看时长，可空 |
| `content_tags` | TEXT | 内容标签 JSON，可空 |
| `reward_status` | TEXT | 奖励状态 |
| `exp_reward` | INTEGER | 本次经验奖励 |
| `satiety_reward` | INTEGER | 本次学识值奖励 |
| `mood_reward` | INTEGER | 本次心情奖励 |
| `occurred_at` | TEXT | 行为发生时间 |
| `created_at` | TEXT | 入库时间 |

### 4.3 pet_growth_log

所有数值变化都写流水，便于排查、统计、后续补偿。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `user_id` | INTEGER | 用户 ID |
| `source_type` | TEXT | 来源类型 |
| `source_id` | TEXT | 来源 ID |
| `change_type` | TEXT | 变化类型 |
| `delta` | INTEGER | 变化值 |
| `before_value` | INTEGER | 变化前 |
| `after_value` | INTEGER | 变化后 |
| `reason` | TEXT | 原因说明 |
| `created_at` | TEXT | 创建时间 |

`change_type` P0 支持：

- `total_exp`
- `satiety`
- `mood`
- `level`
- `stage`

### 4.4 pet_level_config

等级配置表，累计经验达到 `required_total_exp` 后进入对应等级。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `level` | INTEGER | 等级，唯一 |
| `stage` | TEXT | 阶段 |
| `required_total_exp` | INTEGER | 达到该等级所需累计经验 |
| `title` | TEXT | 等级称号 |
| `unlock_features` | TEXT | 解锁能力 JSON，可空 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 4.5 pet_daily_stat

按天聚合用户养成数据，用于日任务、看板和后续运营策略。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `user_id` | INTEGER | 用户 ID |
| `stat_date` | TEXT | 统计日期，格式 `YYYY-MM-DD` |
| `valid_read_count` | INTEGER | 有效阅读次数 |
| `valid_watch_count` | INTEGER | 有效观看次数 |
| `valid_interaction_count` | INTEGER | 有效互动次数 |
| `exp_gained` | INTEGER | 当日获得经验 |
| `satiety_gained` | INTEGER | 当日获得学识值 |
| `mood_gained` | INTEGER | 当日获得心情 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 4.6 pet_decay_config

长时间不互动衰减配置表。P0 当前限定在 48 小时内完成三档衰减：8h、24h、48h。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `decay_window` | TEXT | 衰减窗口：`8h/24h/48h` |
| `inactive_hours` | INTEGER | 不活跃小时数 |
| `satiety_delta` | INTEGER | 学识值变化，负数 |
| `mood_delta` | INTEGER | 心情变化，负数 |
| `message` | TEXT | 刘看山提醒文案 |
| `enabled` | INTEGER | 是否启用，0/1 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 4.7 pet_state_decay_log

记录每次状态衰减，避免同一不活跃周期内重复扣减。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `user_id` | INTEGER | 用户 ID |
| `decay_window` | TEXT | 衰减窗口 |
| `inactive_since` | TEXT | 本轮不活跃开始时间 |
| `checked_at` | TEXT | 本次检查时间 |
| `inactive_hours` | INTEGER | 检查时不活跃小时数 |
| `satiety_delta` | INTEGER | 实际学识值变化 |
| `mood_delta` | INTEGER | 实际心情变化 |
| `before_satiety` | INTEGER | 衰减前学识值 |
| `after_satiety` | INTEGER | 衰减后学识值 |
| `before_mood` | INTEGER | 衰减前心情 |
| `after_mood` | INTEGER | 衰减后心情 |
| `message` | TEXT | 本次提醒文案 |
| `created_at` | TEXT | 创建时间 |

唯一约束：

```sql
UNIQUE(user_id, decay_window, inactive_since);
```

### 4.8 zhihu_content_pool

推荐页内容池。推荐页列表不再硬编码，直接读取这张表。后续只要向该表插入 `status = published` 的内容，刷新推荐页即可扩充信息流。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 主键 |
| `content_id` | TEXT | 内容业务 ID，唯一 |
| `content_type` | TEXT | 内容类型：`article/pin/video/novel` |
| `title` | TEXT | 标题 |
| `author` | TEXT | 作者 |
| `excerpt` | TEXT | 列表摘要 |
| `full_content` | TEXT | 全文内容 |
| `read_text` | TEXT | 列表入口文案，如 `阅读全文` |
| `tags` | TEXT | 标签 JSON |
| `media_type` | TEXT | 媒体样式：`image/video/novel`，可空 |
| `media_label` | TEXT | 媒体占位文案，可空 |
| `like_count` | INTEGER | 点赞数展示值 |
| `comment_count` | INTEGER | 评论数展示值 |
| `collect_count` | INTEGER | 收藏数展示值 |
| `hot_score` | INTEGER | 推荐排序分 |
| `status` | TEXT | `draft/published/hidden` |
| `published_at` | TEXT | 发布时间 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

推荐页查询规则：

```sql
SELECT *
FROM zhihu_content_pool
WHERE status = 'published'
ORDER BY hot_score DESC, published_at DESC, id DESC
LIMIT :limit;
```

互动计数回写规则：

| 行为 | 回写字段 |
| --- | --- |
| `like` | `like_count = like_count + 1` |
| `comment` | `comment_count = comment_count + 1` |
| `collect` | `collect_count = collect_count + 1` |

阅读/观看消费仍以 `pet_content_event` 作为事件事实表，P0 暂不在内容池维护浏览量。

插入新内容示例：

```sql
INSERT INTO zhihu_content_pool
  (content_id, content_type, title, author, excerpt, full_content, read_text, tags,
   like_count, comment_count, collect_count, hot_score, status, published_at)
VALUES
  ('article_demo_001', 'article', '新的推荐文章', '知乎用户',
   '这是一段列表摘要', '这里是全文内容', '阅读全文', '["示例"]',
   12, 3, 5, 600, 'published', '2026-05-08T14:00:00+08:00');
```

### 4.7 zhihu_follow_moment

当前用户关注动态池，来源为本地 mock 数据。用于判断关注 tab 是否有新内容，并驱动刘看山提醒和轻量成长奖励。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | INTEGER | 知乎用户 `uid` |
| `moment_key` | TEXT | 动态去重 key，由 actor/action/time/title/excerpt/author 生成 |
| `actor_name` | TEXT | 动作发起人 |
| `action_text` | TEXT | 动作文案，如回答了问题 |
| `action_time` | INTEGER | 动作时间，Unix 时间戳 |
| `target_title` | TEXT | 目标内容标题 |
| `target_excerpt` | TEXT | 目标内容摘要 |
| `target_author_name` | TEXT | 目标作者 |
| `raw_payload` | TEXT | 原始 JSON |
| `llm_summary_status` | TEXT | LLM 总结状态：`pending/processing/ready/failed/skipped` |
| `llm_summary` | TEXT | 预留 LLM 总结内容 |
| `llm_summary_model` | TEXT | 预留总结模型 |
| `llm_summary_updated_at` | TEXT | 总结更新时间 |
| `reward_granted` | INTEGER | 是否已发放关注动态奖励 |
| `notified_at` | TEXT | 是否已提醒用户查看关注 tab |

### 4.8 zhihu_follow_moment_sync

记录每个用户的关注动态同步水位。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | INTEGER | 知乎用户 `uid`，唯一 |
| `last_synced_at` | TEXT | 最近同步时间 |
| `last_seen_action_time` | INTEGER | 已看到的最大动态时间 |
| `last_new_count` | INTEGER | 最近一次新增动态数 |
| `last_error` | TEXT | 最近一次同步失败原因 |

关注动态奖励基线：

| 触发 | 奖励 |
| --- | --- |
| 每条新增关注动态 | 经验 +2，心情 +1 |
| 单次同步上限 | 经验最多 +10，心情最多 +5 |

LLM 总结预留：

```text
zhihu_follow_moment.raw_payload
-> 后续 LLM worker 读取 pending 动态
-> 生成 llm_summary
-> 刘看山气泡从“去关注 tab 看看”升级为“你关注的人发生了什么”
```

接口约定：

| 接口 | 说明 |
| --- | --- |
| `POST /api/p0/follow-moments/sync` | 基于本地已入库关注动态刷新同步状态，并处理失败摘要重试 |
| `GET /api/p0/follow-moments` | 查询已入库关注动态，用于后续关注 tab/调试 |
| `POST /api/p0/follow-moments/mark-notified` | 前端完成气泡提醒后标记已提醒，避免重复打扰 |

## 5. P0 奖励基线

| 行为 | 内容/动作 | 经验 | 学识值 | 心情 |
| --- | --- | ---: | ---: | ---: |
| 阅读文章 | `article/read` | +5 | +5 | 0 |
| 阅读想法 | `pin/read` | +3 | +3 | 0 |
| 观看视频 | `video/watch` | +8 | +5 | 0 |
| 阅读小说 | `novel/read` | +10 | +6 | 0 |
| 点赞 | `*/like` | +1 | 0 | +3 |
| 收藏 | `*/collect` | +2 | 0 | +5 |
| 评论 | `*/comment` | +3 | 0 | +8 |

## 6. P0 推荐事务流程

```text
1. 接收内容消费/互动事件
2. 写入 pet_content_event
3. 根据 content_type + action_type 计算奖励
4. 更新 pet_profile.total_exp / satiety / mood / level / stage
5. 写入 pet_growth_log
6. 更新 pet_daily_stat
7. 返回最新刘看山状态和奖励结果
```

升级时建议至少写两条流水：

```text
change_type = total_exp
change_type = level
```

如果升级跨阶段，再额外写：

```text
change_type = stage
```

## 7. P1 预留说明

P1 旅行能力单独新增表，不污染 P0 主链路：

```text
pet_travel_profile
pet_travel
pet_travel_content
pet_handbook_entry
```

P1 可以基于 P0 的 `level`、`stage`、`total_exp`、`satiety`、`mood` 来解锁旅行资格。
