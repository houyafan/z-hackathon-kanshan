# 刘看山排行榜开发方案

## 1. 范围定义

本期仅开发两个榜单：

| 榜单 | 目标 | 排序主字段 | 数据来源 |
| --- | --- | --- | --- |
| 等级榜单 | 展示刘看山等级和累计经验最高的用户 | `level DESC, total_exp DESC` | `pet_profile` |
| 游历次数榜单 | 展示完成游历次数最多的用户 | `travel_count DESC` | `pet_travel_event` |

本期不做：

- 好友榜
- 圈子榜
- 本周成长榜
- 排行榜发圈子裂变
- 排行榜奖励发放
- 复杂反作弊

## 2. 产品目标

排行榜用于把单用户养成转成可比较、可展示的长期目标。

等级榜强化“持续内容消费会让刘看山成长”的感知。

游历次数榜强化“多看内容、多互动、多积累精力，就能让刘看山多出门”的 P1 闭环。

## 3. 入口与界面设计

榜单不单开页面，不新增 `/leaderboard` 路由。入口直接嵌入刘看山 3D 的功能菜单。

入口位置：

- 鼠标悬浮 3D 刘看山时，展示已有宠物信息浮层。
- 在浮层操作区增加 `排行榜` 按钮。
- 点击后在刘看山旁边弹出轻量榜单面板。
- 面板可以手动关闭；关闭后仍停留在当前知乎页面，不改变路由。

面板结构：

| 区域 | 内容 |
| --- | --- |
| 面板标题 | 刘看山排行榜 |
| Tab | 等级榜 / 游历榜 |
| 当前用户卡片 | 展示我的名次、等级、经验、游历次数 |
| 榜单列表 | Top N 用户 |
| 空状态 | 暂无榜单数据，引导领养/消费内容/出门游历 |

面板交互要求：

- 面板挂在 3D 刘看山功能菜单体系里，视觉上与宠物悬浮卡同源。
- 不遮挡主站核心内容，默认宽度建议 `360px` 左右。
- 在桌面端靠近刘看山展示；如果刘看山在右下角，则面板向左展开。
- 移动端或窄屏时，面板可降级为底部抽屉。
- 面板打开时，刘看山可以展示气泡：“看看大家的看山都长到哪儿啦。”

榜单列表字段：

| 字段 | 等级榜 | 游历榜 |
| --- | --- | --- |
| 排名 | 是 | 是 |
| 用户昵称/头像 | 是 | 是 |
| 刘看山 2D 图 | 是 | 是 |
| 宠物等级 | 是 | 是 |
| 累计经验 | 是 | 可弱展示 |
| 游历次数 | 可弱展示 | 是 |
| 最近游历时间 | 否 | 是 |
| 是否当前用户 | 是，高亮 | 是，高亮 |

2D 图展示复用产品文档中的“等级 2D 效果图”规划。本期如果资源未完全落地，先按等级生成占位配置：

```text
/static/assets/pet-level/level-01.png
/static/assets/pet-level/level-02.png
...
```

资源缺失时前端降级为当前等级色块/默认刘看山图。

## 4. 排名规则

### 4.1 等级榜单

纳入条件：

- 用户已领养刘看山：`pet_profile.adopted = 1`

排序规则：

```sql
ORDER BY
  pet_profile.level DESC,
  pet_profile.total_exp DESC,
  pet_profile.updated_at ASC,
  pet_profile.user_id ASC
```

说明：

- 等级越高越靠前。
- 等级相同看累计经验。
- 经验相同，先达到该状态的用户靠前。
- 再相同用 `user_id` 保证稳定排序。

### 4.2 游历次数榜单

纳入条件：

- 用户已领养刘看山。
- 至少有 1 次有效游历。

有效游历口径：

```sql
pet_travel_event.status IN ('returned', 'claimed')
```

排序规则：

```sql
ORDER BY
  travel_count DESC,
  claimed_count DESC,
  last_travel_at DESC,
  pet_profile.level DESC,
  pet_profile.user_id ASC
```

说明：

- 游历完成次数越多越靠前。
- 已领取次数更多说明闭环更完整，作为第二排序。
- 最近仍活跃的游历用户靠前。
- 再按等级和用户 ID 稳定排序。

## 5. 数据库设计

### 5.1 是否需要快照表

本期建议先做实时查询，不引入定时快照任务。

理由：

- 当前 Mock 用户量小，实时聚合成本低。
- 等级榜直接查 `pet_profile`。
- 游历榜可通过 `pet_travel_event` 聚合。
- 快照、历史排名变化、日榜周榜可以后续再补。

但为了兼容产品文档中的快照规划，预留表结构，不作为本期必需开发项。

### 5.2 可选预留表：`pet_leaderboard_snapshot`

如果希望本期顺手建表，可加入 `init_p0.sql`，但不必接定时生成。

```sql
CREATE TABLE IF NOT EXISTS pet_leaderboard_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global')),
  rank_type TEXT NOT NULL
    CHECK (rank_type IN ('pet_level', 'travel_count')),
  rank_date TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  rank_no INTEGER NOT NULL CHECK (rank_no >= 1),
  level INTEGER NOT NULL DEFAULT 1,
  stage TEXT NOT NULL DEFAULT 'cub',
  total_exp INTEGER NOT NULL DEFAULT 0,
  travel_count INTEGER NOT NULL DEFAULT 0,
  claimed_travel_count INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (scope, rank_type, rank_date, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pet_leaderboard_snapshot_rank
  ON pet_leaderboard_snapshot (scope, rank_type, rank_date, rank_no);
```

### 5.3 推荐新增索引

为了让实时榜单查询更稳，建议新增：

```sql
CREATE INDEX IF NOT EXISTS idx_pet_profile_level_rank
  ON pet_profile (adopted, level DESC, total_exp DESC, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_pet_travel_event_rank
  ON pet_travel_event (status, user_id, returned_at DESC, claimed_at DESC);
```

## 6. 后端接口设计

统一前缀：

```text
/api/p1/leaderboard
```

### 6.1 获取等级榜

```http
GET /api/p1/leaderboard/pet-level?limit=50
```

响应：

```json
{
  "rankType": "pet_level",
  "scope": "global",
  "limit": 50,
  "items": [
    {
      "rank": 1,
      "userId": 10001,
      "fullname": "看山七子",
      "avatarPath": "",
      "petName": "刘看山",
      "level": 8,
      "stage": "adult",
      "totalExp": 1450,
      "travelCount": 6,
      "claimedTravelCount": 5,
      "level2dImage": "/static/assets/pet-level/level-08.png",
      "isCurrentUser": true
    }
  ],
  "currentUserRank": 1,
  "currentUserItem": {}
}
```

SQL：

```sql
SELECT
  p.user_id,
  u.fullname,
  u.avatar_path,
  p.pet_name,
  p.level,
  p.stage,
  p.total_exp,
  COALESCE(t.travel_count, 0) AS travel_count,
  COALESCE(t.claimed_travel_count, 0) AS claimed_travel_count
FROM pet_profile p
LEFT JOIN zhihu_user u ON u.uid = p.user_id
LEFT JOIN (
  SELECT
    user_id,
    COUNT(*) AS travel_count,
    SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS claimed_travel_count
  FROM pet_travel_event
  WHERE status IN ('returned', 'claimed')
  GROUP BY user_id
) t ON t.user_id = p.user_id
WHERE p.adopted = 1
ORDER BY p.level DESC, p.total_exp DESC, p.updated_at ASC, p.user_id ASC
LIMIT ?;
```

### 6.2 获取游历次数榜

```http
GET /api/p1/leaderboard/travel-count?limit=50
```

响应：

```json
{
  "rankType": "travel_count",
  "scope": "global",
  "limit": 50,
  "items": [
    {
      "rank": 1,
      "userId": 10001,
      "fullname": "看山七子",
      "avatarPath": "",
      "petName": "刘看山",
      "level": 6,
      "stage": "growing",
      "totalExp": 820,
      "travelCount": 12,
      "claimedTravelCount": 10,
      "lastTravelAt": "2026-05-10T16:20:00",
      "level2dImage": "/static/assets/pet-level/level-06.png",
      "isCurrentUser": true
    }
  ],
  "currentUserRank": 1,
  "currentUserItem": {}
}
```

SQL：

```sql
SELECT
  p.user_id,
  u.fullname,
  u.avatar_path,
  p.pet_name,
  p.level,
  p.stage,
  p.total_exp,
  COUNT(t.id) AS travel_count,
  SUM(CASE WHEN t.status = 'claimed' THEN 1 ELSE 0 END) AS claimed_travel_count,
  MAX(COALESCE(t.returned_at, t.claimed_at, t.started_at)) AS last_travel_at
FROM pet_profile p
JOIN pet_travel_event t ON t.user_id = p.user_id
LEFT JOIN zhihu_user u ON u.uid = p.user_id
WHERE p.adopted = 1
  AND t.status IN ('returned', 'claimed')
GROUP BY p.user_id
ORDER BY
  travel_count DESC,
  claimed_travel_count DESC,
  last_travel_at DESC,
  p.level DESC,
  p.user_id ASC
LIMIT ?;
```

### 6.3 当前用户排名

为了让当前用户不在 Top N 时仍能看到自己，后端需要额外计算 `currentUserRank`。

MVP 简化做法：

- 先取全量符合条件用户的排序结果。
- 在 Python 中枚举 rank，截取 Top N。
- 找到当前用户行作为 `currentUserItem`。

理由：

- SQLite 当前数据量小。
- 避免复杂 window function 兼容问题。
- 后续用户量大时再改为 `ROW_NUMBER() OVER (...)`。

## 7. 前端开发方案

### 7.1 入口

不新增路由。排行榜入口并入 3D 刘看山功能菜单。

实现建议：

- 复用现有 `pet-hover-card` / `renderPetHoverCard()` 的操作区。
- 新增按钮：`排行榜`。
- 点击按钮后调用 `openLeaderboardPanel()`。
- 榜单面板作为 `body` 下的固定浮层，位置跟随当前 `#roamingCharacter`。
- 当前页面不跳转，`window.location.pathname` 不变化。

### 7.2 状态

新增前端状态：

```js
let leaderboardType = "pet_level";
let leaderboardData = null;
let leaderboardLoaded = false;
let leaderboardError = null;
let leaderboardPanelOpen = false;
```

### 7.3 浮层组件

| 组件 | 说明 |
| --- | --- |
| `openLeaderboardPanel()` | 打开刘看山旁边的榜单面板 |
| `closeLeaderboardPanel()` | 关闭榜单面板 |
| `positionLeaderboardPanel()` | 根据 3D 刘看山当前位置调整面板位置 |
| `renderLeaderboardPanel()` | 渲染榜单浮层 |
| `leaderboardTabs()` | 等级榜 / 游历榜切换 |
| `currentUserRankCard()` | 当前用户名次卡 |
| `leaderboardItem()` | 单行榜单项 |
| `level2dImage(level)` | 根据等级返回 2D 图 |

### 7.4 交互

- 默认打开等级榜。
- 点击 Tab 切换榜单并重新请求接口。
- 点击浮层关闭按钮关闭。
- 用户拖拽/移动刘看山后，面板重新定位。
- 点击其他功能菜单项时，榜单面板自动关闭。
- 当前用户行高亮。
- Top 3 使用更明显的排名样式。
- 空状态：
  - 等级榜：提示“领养刘看山并消费内容后上榜”
  - 游历榜：提示“Lv.2 后积累精力，让刘看山出门游历”

### 7.5 样式

整体保持知乎 PC Mock 的克制风格，不做营销页。

视觉建议：

- 面板宽度建议 `360px`，最大高度不超过视口高度的 `70vh`。
- 面板使用白底、细边框、轻阴影，与宠物 hover card 统一。
- Top 3 可使用金/银/铜小标识，但不做大面积炫彩。
- 2D 图卡片大小固定，避免列表跳动。
- 当前用户卡片使用知乎蓝弱高亮。
- 榜单列表内部滚动，不滚动页面主体。

## 8. 与现有能力的关系

| 现有能力 | 复用方式 |
| --- | --- |
| `zhihu_user` | 昵称、头像 |
| `pet_profile` | 等级、阶段、经验、是否领养 |
| `pet_travel_event` | 游历次数、领取次数、最近游历 |
| `pet_level_config` | 等级阶段标题，可选展示 |
| 2D 效果图规划 | 榜单用户主视觉 |
| 登录态 | 识别当前用户并高亮 |

## 9. 开发任务拆分

### 后端

1. `init_p0.sql` 新增榜单查询索引。
2. `server.py` 新增 `leaderboard_item` 序列化函数。
3. `server.py` 新增等级榜查询函数。
4. `server.py` 新增游历次数榜查询函数。
5. `Handler.do_GET` 新增：
   - `/api/p1/leaderboard/pet-level`
   - `/api/p1/leaderboard/travel-count`
6. 接口需要登录态，未登录返回 401。
7. limit 限制：默认 50，最大 100。

### 前端

1. `app.js` 在刘看山 3D 功能菜单中增加 `排行榜` 按钮。
2. 新增榜单浮层打开、关闭、定位逻辑。
3. 新增榜单数据加载函数。
4. 新增榜单浮层渲染。
5. 新增 Tab 切换。
6. 新增当前用户高亮和空状态。
7. `styles.css` 新增榜单浮层样式，并适配窄屏底部抽屉。

### 测试

1. 等级榜排序：等级优先、经验次之。
2. 游历榜排序：有效游历次数优先。
3. 当前用户在 Top N 内时高亮正确。
4. 当前用户不在 Top N 内时仍返回 `currentUserRank`。
5. 没有领养用户时空状态正确。
6. 没有游历记录时游历榜空状态正确。
7. 未登录访问接口返回 401。

## 10. 验收标准

| 场景 | 验收标准 |
| --- | --- |
| 打开排行榜 | 从 3D 刘看山功能菜单可打开榜单浮层，不发生页面跳转 |
| 等级榜 | 能展示已领养用户，按等级和经验排序 |
| 游历榜 | 能展示有有效游历的用户，按游历次数排序 |
| 当前用户 | 当前用户行高亮，并展示我的名次 |
| 数据为空 | 展示明确引导，不报错 |
| 登录保护 | 未登录不能访问排行榜接口 |
| 视觉一致 | 榜单浮层与刘看山 hover card 风格一致，不遮挡主站主要内容 |

## 11. 不纳入本期的后续项

- 榜单快照定时任务
- 榜单历史升降趋势
- 发圈子裂变
- 排行榜奖励
- 好友/圈子 scope
- 周榜/月榜
- 复杂反刷
