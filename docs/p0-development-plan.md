# 刘看山虚拟宠物 P0 开发计划

归档时间：2026-05-08  
阶段范围：P0 内容消费 + 刘看山升级  
依赖资料：
- `docs/database-model-p0.md`
- `db/sqlite/init_p0.sql`
- `刘看山虚拟宠物开发方案.md`
- `3d-liukanshan-roaming/SKILL.md`

## 1. P0 目标

P0 只验证一条核心闭环：

```text
用户消费内容/产生互动
-> 宠物系统接收事件
-> 计算经验、饱食度、心情奖励
-> 更新刘看山等级和状态
-> 前端 3D 刘看山给出气泡/动作反馈
```

本阶段不做旅行、手账、社交、权益兑换、防刷、多宠物、多 IP。

## 2. P0 范围

### 2.0 Mock 知乎 PC 主站载体

P0 的所有前后端联调、演示和验收都以“知乎 PC 主站 mock 页面”为载体，而不是孤立 demo。

必须提供两个核心页面：

| 页面 | Mock URL | 核心职责 |
| --- | --- | --- |
| 推荐页 | `https://www.zhihu.com/` | 展示推荐信息流，模拟文章、想法、视频、小说的内容消费和互动事件 |
| 个人页 | `https://www.zhihu.com/people/p2wcex` | 展示用户个人主页，在个人页增加刘看山领养入口 |

本地开发可使用等价路由：

```text
http://localhost:{port}/
http://localhost:{port}/people/p2wcex
```

推荐页是“内容消费发生地”，个人页是“领养和查看刘看山状态的主入口”。后续 P1 旅行能力也应继续基于这套 PC 主站 mock 载体扩展。

### 2.1 内容事件范围

内容类型：

- `article`：文章
- `pin`：想法
- `video`：视频
- `novel`：小说

行为类型：

- `read`：阅读
- `watch`：观看
- `like`：点赞
- `comment`：评论
- `collect`：收藏

### 2.2 成长数值范围

- `total_exp`：累计总经验，决定等级
- `level`：当前等级
- `stage`：成长阶段
- `satiety`：饱食度
- `mood`：心情值
- 累计统计：阅读数、观看数、互动数
- 每日统计：阅读、观看、互动和奖励聚合

### 2.3 表现层范围

复用 `3d-liukanshan-roaming` 已有能力：

- `setMessage(text, options?)`
- `moveTo(x, y, options?)`
- `moveToElement(element, options?)`
- `getPosition()`
- `isMovingStatus()`

P0 不要求扩展旅行 API，只补充业务侧调用规范：发奖、升级、心情变化时，通过气泡文案和移动/轻动作表现给用户反馈。

## 3. 里程碑拆解

### M0：项目与数据库基线

目标：保证 P0 数据库可初始化、可重复执行、可用于本地开发。

任务：

- 确认 SQLite 初始化脚本可执行。
- 固化 P0 表结构和等级种子数据。
- 明确本地数据库文件位置。
- 补充数据库访问层的初始化入口。

已有产物：

- `docs/database-model-p0.md`
- `db/sqlite/init_p0.sql`
- `db/sqlite/liukanshan_p0.sqlite`

验收：

- 本地执行 `sqlite3 db/sqlite/liukanshan_p0.sqlite < db/sqlite/init_p0.sql` 不报错。
- 存在 5 张 P0 表。
- `pet_level_config` 有 1-10 级配置。

### M1：宠物档案与领养

目标：用户可以初始化自己的刘看山档案。

后端能力：

- 查询宠物档案。
- 不存在时返回未领养状态。
- 创建领养记录。
- 已领养用户重复领养时返回现有档案。

建议接口：

```http
GET /api/p0/pet/profile?userId=10001
POST /api/p0/pet/adopt
```

`POST /api/p0/pet/adopt` 请求：

```json
{
  "userId": 10001,
  "petName": "刘看山"
}
```

返回：

```json
{
  "profile": {
    "userId": 10001,
    "adopted": true,
    "petName": "刘看山",
    "level": 1,
    "stage": "cub",
    "totalExp": 0,
    "satiety": 50,
    "mood": 50
  }
}
```

数据库写入：

- `pet_profile`

前端能力：

- 页面加载时拉取档案。
- 未领养时显示领养入口。
- 领养成功后初始化 3D 刘看山。
- 调用 `setMessage("你好，我是刘看山~")`。

验收：

- 新用户可创建档案。
- 老用户重复领养不会创建多条 `pet_profile`。
- 前端能展示初始等级、阶段、饱食度、心情值。

### M2：内容事件接入与奖励计算

目标：接收内容消费事件，并转化为 P0 奖励。

建议接口：

```http
POST /api/p0/pet/content-events
```

请求：

```json
{
  "eventId": "evt_001",
  "userId": 10001,
  "contentId": "article_123",
  "contentType": "article",
  "actionType": "read",
  "completionRatio": 0.86,
  "durationSec": 48,
  "contentTags": ["科技", "科普"],
  "occurredAt": "2026-05-08T12:00:00+08:00"
}
```

返回：

```json
{
  "reward": {
    "exp": 5,
    "satiety": 5,
    "mood": 0,
    "levelUp": false
  },
  "profile": {
    "level": 1,
    "stage": "cub",
    "totalExp": 5,
    "satiety": 55,
    "mood": 50
  }
}
```

奖励基线：

| 行为 | 奖励 |
| --- | --- |
| `article/read` | 经验 +5，饱食度 +5 |
| `pin/read` | 经验 +3，饱食度 +3 |
| `video/watch` | 经验 +8，饱食度 +5 |
| `novel/read` | 经验 +10，饱食度 +6 |
| `*/like` | 经验 +1，心情 +3 |
| `*/collect` | 经验 +2，心情 +5 |
| `*/comment` | 经验 +3，心情 +8 |

数据库写入：

- `pet_content_event`
- `pet_profile`
- `pet_growth_log`
- `pet_daily_stat`

事务要求：

```text
1. 插入 pet_content_event
2. 读取 pet_profile
3. 计算奖励和新等级
4. 更新 pet_profile
5. 写 pet_growth_log
6. upsert pet_daily_stat
7. 提交事务
```

验收：

- 每类内容事件都能写入 `pet_content_event`。
- 奖励能正确反映到 `pet_profile`。
- 饱食度和心情值不会超过 100。
- `pet_growth_log` 至少记录经验变化；如升级，额外记录等级变化。
- `pet_daily_stat` 能按天聚合。

### M3：等级计算与成长阶段

目标：累计经验达到配置阈值后自动升级，并切换成长阶段。

等级规则：

```sql
SELECT level, stage
FROM pet_level_config
WHERE required_total_exp <= :totalExp
ORDER BY level DESC
LIMIT 1;
```

开发任务：

- 实现等级配置读取。
- 实现 `total_exp -> level/stage` 计算函数。
- 当等级变化时写 `pet_growth_log(change_type = 'level')`。
- 当阶段变化时写 `pet_growth_log(change_type = 'stage')`。
- 返回 `levelUp` 和 `stageChanged` 给前端。

返回示例：

```json
{
  "reward": {
    "exp": 10,
    "satiety": 6,
    "mood": 0,
    "levelUp": true,
    "fromLevel": 1,
    "toLevel": 2,
    "stageChanged": false
  }
}
```

前端表现：

- 升级时调用 `setMessage("看山升级啦！现在是 2 级")`。
- 非升级时调用 `setMessage("看山吃到一口好内容，经验 +5")`。
- 心情奖励时调用 `setMessage("收到互动，看山心情变好啦")`。

验收：

- 总经验达到 50 时从 1 级升到 2 级。
- 总经验达到 250 时阶段从 `cub` 切到 `growing`。
- 跨多级增加经验时能直接计算到正确等级。

### M4：前端业务壳与 3D 刘看山联动

目标：在知乎 PC 主站 mock 页面中，把领养、内容消费、奖励和升级结果映射为用户可感知的刘看山反馈。

前端模块建议：

```text
PetAppShell
PetStateStore
ContentEventAdapter
RewardClient
RoamingAdapter
ZhihuMockRouter
ZhihuRecommendPage
ZhihuPeoplePage
```

模块职责：

- `PetAppShell`：挂载刘看山入口，处理领养态。
- `PetStateStore`：保存 `profile`，统一更新 UI。
- `ContentEventAdapter`：在推荐页把阅读、观看、点赞、收藏、评论映射为 P0 内容事件。
- `RewardClient`：提交事件，接收奖励结果。
- `RoamingAdapter`：封装 `setMessage`、`moveToElement` 等表现层调用。
- `ZhihuMockRouter`：提供 `/` 和 `/people/p2wcex` 两个本地 mock 路由。
- `ZhihuRecommendPage`：承载推荐信息流和内容消费事件。
- `ZhihuPeoplePage`：承载个人页资料区、刘看山领养入口和宠物状态入口。

推荐页能力：

- 首屏模拟知乎 PC 推荐流布局。
- 每条 feed card 标注 `content_id`、`content_type`。
- 阅读文章、阅读想法、观看视频、阅读小说时触发对应 `read/watch` 事件。
- 点赞、收藏、评论按钮触发对应互动事件。
- 事件提交成功后刷新刘看山状态，并调用 `RoamingAdapter` 展示奖励反馈。

个人页能力：

- 路由固定为 `/people/p2wcex`。
- 展示基础用户资料、动态、回答/文章 tab 的 mock 信息。
- 在个人资料区或右侧栏增加“领养刘看山”入口。
- 未领养时展示领养按钮；已领养时展示刘看山等级、阶段、累计经验、饱食度、心情。
- 领养成功后初始化 3D 刘看山，并提示“你好，我是刘看山~”。

P0 公共展示建议：

- 刘看山悬浮模型可在推荐页和个人页复用。
- 简单状态面板展示等级、阶段、累计经验、饱食度、心情。
- 开发态可以保留事件模拟按钮，但正式验收应优先通过推荐页 feed 的真实交互触发事件。

验收：

- 访问本地 `/people/p2wcex` 可看到个人页和领养入口。
- 在个人页领养后，数据库产生 `pet_profile`。
- 访问本地 `/` 可看到推荐页信息流。
- 在推荐页消费文章、想法、视频、小说后，后端数据变化，前端状态同步刷新。
- 在推荐页点赞、收藏、评论后，心情值变化并有刘看山反馈。
- 刘看山气泡能展示奖励信息。
- 升级时有明确提示。
- 刷新页面后能从 SQLite 中恢复状态。

### M5：联调、测试与验收

目标：保证 P0 主链路稳定、可演示、可继续扩展 P1。

测试用例：

| 用例 | 预期 |
| --- | --- |
| 新用户查询档案 | 返回未领养或初始化态 |
| 新用户领养 | 创建 `pet_profile` |
| 重复领养 | 不重复创建 |
| 阅读文章 | 经验 +5，饱食度 +5 |
| 观看视频 | 经验 +8，饱食度 +5 |
| 点赞内容 | 经验 +1，心情 +3 |
| 收藏内容 | 经验 +2，心情 +5 |
| 评论内容 | 经验 +3，心情 +8 |
| 经验达到 50 | 等级升到 2 |
| 经验达到 250 | 阶段进入 `growing` |
| 饱食度/心情接近上限 | 最大值封顶 100 |
| 同一天多次事件 | `pet_daily_stat` 聚合正确 |

验收口径：

- P0 数据库结构稳定。
- P0 接口能完成领养、查询、事件提交。
- 内容事件能驱动经验、等级、饱食度、心情变化。
- 前端能展示 3D 刘看山，并对奖励/升级做反馈。
- 不包含旅行相关字段和流程。

## 4. 推荐开发顺序

```text
1. SQLite 数据访问层
2. pet_profile 领养和查询
3. 奖励规则模块
4. 内容事件提交事务
5. 等级计算模块
6. 每日统计 upsert
7. 知乎 PC mock 路由和页面框架
8. 个人页领养入口
9. 推荐页内容消费事件
10. 前端状态面板
11. roaming 反馈适配
12. 联调与验收用例
```

## 5. P0 接口清单

### 查询宠物档案

```http
GET /api/p0/pet/profile?userId={userId}
```

### 领养刘看山

```http
POST /api/p0/pet/adopt
Content-Type: application/json
```

```json
{
  "userId": 10001,
  "petName": "刘看山"
}
```

### 提交内容事件

```http
POST /api/p0/pet/content-events
Content-Type: application/json
```

```json
{
  "eventId": "evt_001",
  "userId": 10001,
  "contentId": "article_123",
  "contentType": "article",
  "actionType": "read",
  "completionRatio": 0.86,
  "durationSec": 48,
  "contentTags": ["科技", "科普"],
  "occurredAt": "2026-05-08T12:00:00+08:00"
}
```

### 查询每日统计

```http
GET /api/p0/pet/daily-stat?userId={userId}&date=2026-05-08
```

### 查询推荐内容池

```http
GET /api/p0/contents?limit=30
```

返回 `zhihu_content_pool` 中 `status = published` 的内容，按 `hot_score DESC, published_at DESC, id DESC` 排序。推荐页列表完全由该接口驱动，后续向 DB 插入内容即可扩充推荐信息流。

### 查询内容全文

```http
GET /api/p0/contents/{contentId}
```

用于推荐页点击标题或阅读全文后打开全文弹窗。全文打开后触发 `read/watch` 成长事件；点赞、评论、收藏触发互动事件，并同步回写内容池展示计数。

## 5.1 Mock 页面路由清单

### 推荐页

```http
GET /
```

本地等价知乎 PC 首页 `https://www.zhihu.com/`，用于内容消费。

页面必须至少包含以下 feed 类型：

| feed 类型 | content_type | 默认动作 |
| --- | --- | --- |
| 文章卡片 | `article` | `read` |
| 想法卡片 | `pin` | `read` |
| 视频卡片 | `video` | `watch` |
| 小说卡片 | `novel` | `read` |

每张卡片还需要提供：

- 点赞：`like`
- 收藏：`collect`
- 评论：`comment`

### 个人页

```http
GET /people/p2wcex
```

本地等价用户个人页 `https://www.zhihu.com/people/p2wcex`，用于领养刘看山。

页面必须包含：

- 用户资料头部区域。
- 刘看山领养入口。
- 已领养后的宠物状态摘要。
- 返回推荐页入口。

## 6. 数据库读写责任

| 业务动作 | 读取 | 写入 |
| --- | --- | --- |
| 查询档案 | `pet_profile` | 无 |
| 领养 | `pet_profile` | `pet_profile` |
| 提交内容事件 | `pet_profile`, `pet_level_config` | `pet_content_event`, `pet_profile`, `pet_growth_log`, `pet_daily_stat` |
| 查询每日统计 | `pet_daily_stat` | 无 |
| 查询推荐列表 | `zhihu_content_pool` | 无 |
| 查询内容全文 | `zhihu_content_pool` | 无 |
| 点赞/评论/收藏内容 | `zhihu_content_pool`, `pet_profile`, `pet_level_config` | `zhihu_content_pool`, `pet_content_event`, `pet_profile`, `pet_growth_log`, `pet_daily_stat` |

## 6.1 推荐内容池落地状态

- 推荐页内容列表已从 `zhihu_content_pool` 读取，不再依赖前端硬编码 feed。
- 内容池支持文章、想法、视频、小说四类内容。
- 点击标题或阅读全文会通过内容详情接口加载 `full_content` 并打开全文弹窗。
- 点赞、评论、收藏会同时驱动刘看山成长和内容池计数回写。
- 后续扩充推荐页内容只需向 `zhihu_content_pool` 插入 `status = published` 的记录。

## 7. P0 不做事项

- 不做旅行能力。
- 不做游历精力。
- 不做旅行手账。
- 不做内容推荐。
- 不做防刷。
- 不做权益兑换。
- 不做多宠物或换 IP。
- 不做复杂骨骼动画扩展。

## 8. P1 衔接点

P1 旅行能力可以直接复用 P0 的：

- `user_id`
- `level`
- `stage`
- `total_exp`
- `satiety`
- `mood`
- `pet_content_event`
- `pet_daily_stat`

P1 新增旅行表即可，不需要回改 P0 主链路：

```text
pet_travel_profile
pet_travel
pet_travel_content
pet_handbook_entry
```

P1 触发旅行资格时，建议读取 P0 的等级、阶段、饱食度、心情值，作为门槛和主题权重输入。

## 9. 当前 Mock 载体实现

已基于推荐页和个人页示意图落地 P0 mock 页面：

| 文件 | 说明 |
| --- | --- |
| `p0_mock/server.py` | Python 本地服务，承载页面路由和 P0 API |
| `p0_mock/static/index.html` | 推荐页/个人页共用 HTML 壳 |
| `p0_mock/static/styles.css` | 知乎 PC 风格页面样式与响应式适配 |
| `p0_mock/static/app.js` | 领养、内容消费、互动事件、刘看山反馈联动 |

本地启动：

```bash
python3 p0_mock/server.py
```

访问：

```text
http://127.0.0.1:5173/
http://127.0.0.1:5173/people/p2wcex
```

当前 mock 已具备：

- 个人页领养刘看山。
- 推荐页阅读文章、阅读想法、观看视频、阅读小说。
- 推荐页点赞、评论、收藏。
- 内容事件写入 SQLite。
- `pet_profile`、`pet_content_event`、`pet_growth_log`、`pet_daily_stat` 联动更新。
- 3D 刘看山悬浮展示、移动到触发元素、气泡反馈奖励和升级信息。
