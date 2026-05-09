# 知乎登录接入方案

归档时间：2026-05-08  
适用阶段：P0 内容消费 + 刘看山升级  
依据文档：
- `public_api_doc/oauth/quickstart.md`
- `public_api_doc/oauth/access_token.md`
- `public_api_doc/oauth/user_info.md`
- `public_api_doc/community/quickstart.md`

## 1. 目标

当前 P0 mock 使用固定 `DEFAULT_USER_ID = 10001`。接入知乎登录后，推荐页、个人页、领养、重置、内容消费、成长事件都必须基于“当前登录知乎用户”访问。

目标链路：

```text
未登录用户访问产品
-> 跳转知乎 OAuth 授权页
-> 回调拿 authorization_code
-> 服务端换取 access_token
-> 服务端拉取知乎用户信息
-> 建立本产品 session
-> 使用知乎 uid 作为 user_id 进入 P0 主链路
```

P0 只接入登录态与用户身份，不在本阶段接入社区发布、评论等开放能力。

## 2. OAuth 流程

### 2.1 登录入口

新增服务端路由：

```http
GET /auth/login
```

服务端生成 `state` 后重定向到知乎授权页：

```text
https://openapi.zhihu.com/authorize
  ?redirect_uri={zhihu_auth_redirect_uri}
  &app_id={zhihu_app_id}
  &response_type=code
  &state={state}
```

配置项：

| 配置字段 | 说明 |
| --- | --- |
| `zhihu_app_id` | 知乎 OAuth app_id |
| `zhihu_app_key` | 知乎 OAuth app_key，只允许服务端持有 |
| `zhihu_auth_redirect_uri` | 回调地址，如 `http://24a94f2b.r1.cpolar.top/auth/callback` |
| `auth_mode` | `oauth` 或 `mock` |

### 2.2 登录回调

新增服务端路由：

```http
GET /auth/callback?code={authorization_code}&state={state}
```

处理步骤：

1. 校验 `state` 是否存在且未过期。
2. 使用 `code` 调用知乎 `POST https://openapi.zhihu.com/access_token`。
3. 从响应获取 `access_token`、`token_type`、`expires_in`。
4. 使用 `Authorization: Bearer {access_token}` 调用知乎 `GET https://openapi.zhihu.com/user`。
5. 将知乎用户写入本地用户表。
6. 创建本产品 session。
7. 设置 `Set-Cookie: lks_session=...; HttpOnly; SameSite=Lax; Path=/`。
8. 重定向回用户原始目标页，默认 `/`。

实际联调中知乎可能使用 `authorization_code` 作为回调参数名，因此当前实现同时兼容 `code` 和 `authorization_code`。知乎 OAuth 文档中鉴权失败可能以 HTTP 200 + `code=401/403` 形式返回，服务端必须同时判断 HTTP 状态与响应体业务码。

实际 access token 响应可能同时包含成功业务码，例如：

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "code": 20000,
  "expires_in": 2592000
}
```

因此当前实现以 `access_token` 是否存在作为换 token 成功判断，不再把任意 `code` 字段都视为错误。

### 2.3 当前用户

新增接口：

```http
GET /api/auth/me
```

已登录返回：

```json
{
  "authenticated": true,
  "user": {
    "userId": 123456789,
    "uid": 123456789,
    "fullname": "知乎用户",
    "avatarPath": "https://picx.zhimg.com/...",
    "headline": "个人简介"
  }
}
```

未登录返回：

```json
{
  "authenticated": false,
  "loginUrl": "/auth/login"
}
```

### 2.4 登出

新增接口：

```http
POST /auth/logout
```

处理：

- 删除本地 session。
- 清空 `lks_session` cookie。
- 返回登录页或 `/auth/login`。

## 3. 登录闸口

### 3.1 页面保护

以下页面必须登录后访问：

| 路由 | 处理 |
| --- | --- |
| `/` | 未登录重定向 `/auth/login?next=/` |
| `/people/p2wcex` | 未登录重定向 `/auth/login?next=/people/p2wcex` |

静态资源不需要登录：

- `/static/*`
- `/3d-liukanshan-roaming/*`

### 3.2 API 保护

以下接口必须登录：

| 接口 | 说明 |
| --- | --- |
| `GET /api/p0/pet/profile` | 当前用户宠物档案 |
| `GET /api/p0/pet/daily-stat` | 当前用户每日统计 |
| `POST /api/p0/pet/adopt` | 当前用户领养 |
| `POST /api/p0/pet/reset` | 当前用户重置 |
| `POST /api/p0/pet/content-events` | 当前用户内容事件 |

以下接口可不登录读取：

| 接口 | 说明 |
| --- | --- |
| `GET /api/p0/contents` | 推荐内容池列表 |
| `GET /api/p0/contents/{contentId}` | 推荐内容全文 |

如果产品要求“必须登录才看任何内容”，也可以把内容池接口一起保护；P0 建议页面保护即可，接口保持可读，方便后续内容调试和自动化灌数据。

## 4. 用户身份改造

### 4.1 user_id 来源

登录前：

```text
DEFAULT_USER_ID = 10001
```

登录后：

```text
user_id = zhihu_user.uid
```

前端不再传 `userId` 作为可信身份。所有 P0 接口都从 session 解析当前用户：

```text
request cookie -> lks_session -> session.user_id -> pet_profile.user_id
```

兼容建议：

- 本地开发可在 `p0_mock/config.json` 中把 `auth_mode` 改为 `mock`。
- 真实 OAuth 模式下忽略前端传入的 `userId`。

### 4.2 前端调整

当前 `app.js` 里的固定 `USER_ID = 10001` 需要替换为登录态：

```text
启动应用
-> GET /api/auth/me
-> 未登录：展示登录态兜底或由页面层重定向
-> 已登录：保存 currentUser
-> 所有 P0 API 不再拼 userId
```

页面展示：

- 右上角头像使用知乎 `avatar_path`。
- 用户名使用 `fullname`。
- 个人页 `people/p2wcex` 仍可作为 mock 路由，但内容展示当前登录用户信息。

## 5. 数据库模型

### 5.1 zhihu_user

存储授权过的知乎用户基础信息。

```sql
CREATE TABLE IF NOT EXISTS zhihu_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  fullname TEXT NOT NULL,
  gender TEXT DEFAULT NULL,
  headline TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  avatar_path TEXT DEFAULT NULL,
  phone_no TEXT DEFAULT NULL,
  email TEXT DEFAULT NULL,
  last_login_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (uid)
);
```

### 5.2 zhihu_oauth_token

P0 可以只保存 access token；若后续文档提供 refresh token，再扩展刷新机制。

```sql
CREATE TABLE IF NOT EXISTS zhihu_oauth_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  access_token TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  expires_at TEXT NOT NULL,
  scope TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id)
);
```

说明：

- `user_id` 对应 `zhihu_user.uid`。
- 本地 SQLite 阶段可明文存储；进入真实环境前必须使用服务端 KMS/密钥加密。
- `access_token` 不下发给前端。

### 5.3 auth_session

服务端 session 表。

```sql
CREATE TABLE IF NOT EXISTS auth_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  state TEXT DEFAULT NULL,
  next_url TEXT DEFAULT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (session_id)
);
```

### 5.4 oauth_state

防 CSRF 和登录回跳。

```sql
CREATE TABLE IF NOT EXISTS oauth_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL,
  next_url TEXT DEFAULT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (state)
);
```

## 6. 后端模块设计

建议在 `p0_mock/server.py` 中先按函数拆分，后续再抽模块。

| 模块/函数 | 职责 |
| --- | --- |
| `get_current_session(handler)` | 从 cookie 解析 session |
| `require_auth(handler)` | API 和页面登录保护 |
| `create_oauth_state(next_url)` | 创建 state |
| `consume_oauth_state(state)` | 校验并消费 state |
| `exchange_access_token(code)` | 调知乎 access_token |
| `fetch_zhihu_user(access_token)` | 调知乎 user |
| `upsert_zhihu_user(user)` | 写入知乎用户信息 |
| `save_oauth_token(user_id, token)` | 保存 token |
| `create_session(user_id)` | 创建本产品 session |
| `clear_session(handler)` | 登出清理 |

P0 接口改造：

- `fetch_profile(conn, user_id)` 保持不变。
- `apply_content_event(payload)` 改为接收可信 `user_id` 参数，避免从 body 取用户身份。
- `adopt/reset/daily-stat/profile` 都从 session 获取 `user_id`。

## 7. 安全要求

- `zhihu_app_key` 只允许服务端从 `p0_mock/config.json` 读取，不写入前端。
- `access_token` 只保存在服务端，不下发到浏览器。
- `state` 必须一次性消费，建议 10 分钟过期。
- session 建议 7 天过期，P0 可先固定 24 小时。
- cookie 设置 `HttpOnly; SameSite=Lax; Path=/`。
- 生产 HTTPS 下增加 `Secure`。
- 登录回跳 `next` 只能允许站内路径，禁止外链跳转。
- 处理知乎 OAuth 的业务错误码：HTTP 200 但响应体 `code=401/403/404` 也视为失败。

## 8. 与社区 API 的关系

`public_api_doc/community/quickstart.md` 使用的是 AK/SK 签名体系，其中 `app_key` 是用户 token，`app_secret` 是应用密钥；这套能力用于圈子、想法、评论、点赞等社区开放接口，不是网页登录鉴权。

本次登录接入只使用 OAuth：

- 登录：OAuth 授权码模式。
- 用户身份：OAuth `/user`。
- P0 成长事件：仍使用本产品内部事件接口。

后续如果要把推荐页互动同步到真实知乎社区，再单独设计 Community API 的签名代理层。

## 9. 开发顺序

1. 在 `init_p0.sql` 新增 `zhihu_user`、`zhihu_oauth_token`、`auth_session`、`oauth_state`。
2. 在 `server.py` 增加配置读取和 OAuth client 函数。
3. 增加 `/auth/login`、`/auth/callback`、`/auth/logout`、`/api/auth/me`。
4. 给页面路由加登录闸口。
5. 给 P0 写接口加 `require_auth`，移除前端可信 `userId`。
6. 前端启动时调用 `/api/auth/me`，头像和个人信息来自知乎用户。
7. 保留本地 mock auth 开关，方便无真实 app_id 时调试。
8. 补充登录成功、登录失败、token 过期、session 过期的验收用例。

## 10. 验收标准

| 场景 | 预期 |
| --- | --- |
| 未登录访问 `/` | 跳转 `/auth/login`，再跳知乎授权 |
| 授权成功回调 | 建立 session，回到原页面 |
| 授权失败/无 code | 展示登录失败页或返回 `/auth/login` |
| 已登录访问推荐页 | 正常展示内容池和刘看山状态 |
| 已登录访问个人页 | 展示当前知乎用户信息和领养入口 |
| 领养刘看山 | `pet_profile.user_id = zhihu_user.uid` |
| 内容消费 | `pet_content_event.user_id = zhihu_user.uid` |
| 前端伪造 userId | 后端忽略，以 session 用户为准 |
| 登出后访问产品 | 重新要求登录 |

## 11. 当前实现状态

已完成落地：

- `db/sqlite/init_p0.sql` 已新增 `zhihu_user`、`zhihu_oauth_token`、`auth_session`、`oauth_state`。
- `p0_mock/server.py` 已实现 `/auth/login`、`/auth/callback`、`/auth/logout`、`/api/auth/me`。
- `/auth/callback` 已兼容 `code` 和 `authorization_code` 两种授权码参数。
- `access_token` 响应已兼容 `code: 20000` 的成功格式。
- 已接入 `GET /user/moments`，新增关注动态会入库并触发刘看山提醒关注 tab。
- 关注动态表已预留 `llm_summary_status/llm_summary/llm_summary_model`，后续可接 LLM 总结关注内容。
- 推荐页 `/` 和个人页 `/people/p2wcex` 已加登录闸口。
- P0 用户态接口已改为从 session 取 `user_id`，忽略前端传入的 `userId`。
- `p0_mock/static/app.js` 已改为启动时调用 `/api/auth/me`，并使用当前知乎用户渲染头像、昵称和简介。
- 登录模式由 `p0_mock/config.json` 的 `auth_mode` 控制，当前默认走 `oauth`。

本地 mock 登录验证：

```text
GET /                         -> 302 /auth/login?next=/
GET /auth/login               -> 写入 lks_session，回跳 /
GET /api/auth/me              -> 返回当前 mock 知乎用户
GET /api/p0/pet/profile       -> 未登录 401，登录后返回当前用户档案
POST /auth/logout             -> 清空 lks_session
```

真实 OAuth 联调读取 `p0_mock/config.json`，当前配置：

```json
{
  "auth_mode": "oauth",
  "zhihu_app_id": "201",
  "zhihu_auth_redirect_uri": "http://24a94f2b.r1.cpolar.top/auth/callback"
}
```

启动命令：

```bash
python3 p0_mock/server.py
```
