# 获取用户信息

## 接口说明

获取当前授权用户的基本信息。

> Access Token 使用方式请参考 [快速开始](quickstart.md)。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://openapi.zhihu.com/user` |
| HTTP Method | GET |

## 请求参数

将获取的 `access_token` 放在 HTTP Header `Authorization` 中：

```
Authorization: Bearer {access_token}
```

## 响应数据

### 成功响应示例

```json
{
  "uid": 123456789,
  "fullname": "知乎用户",
  "gender": "male",
  "headline": "个人简介",
  "description": "个人描述",
  "avatar_path": "https://picx.zhimg.com/...",
  "phone_no": "13800138000",
  "email": "user@example.com"
}
```

### 响应字段说明

| 字段 | 类型 | 说明 |
| :- | :- | :- |
| uid | int | 知乎用户 ID |
| fullname | string | 用户昵称 |
| gender | string | 性别（`male`、`female`、`unknown`） |
| headline | string | 用户个人简介 |
| description | string | 用户个人描述 |
| avatar_path | string | 用户头像地址 |
| phone_no | string | 用户手机号（用户未授权时为空字符串） |
| email | string | 用户邮箱（用户未授权时为空字符串） |

### 错误响应

| 场景 | HTTP 状态码 | 响应体 |
| :- | :- | :- |
| 用户不存在 | 200 | `{"code": 404, "data": "User don't exist"}` |

> 其他公共错误（鉴权失败、权限不足等）请参考 [快速开始](quickstart.md) 中的公共错误响应。

## curl 示例

```bash
curl -s "https://openapi.zhihu.com/user" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```
