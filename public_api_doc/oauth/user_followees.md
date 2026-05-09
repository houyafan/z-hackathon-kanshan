# 获取互相关注列表

## 接口说明

获取当前授权用户与其互相关注的用户列表（即双向关注的好友）。

> Access Token 使用方式及通用分页参数请参考 [快速开始](quickstart.md)。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://openapi.zhihu.com/user/followees` |
| HTTP Method | GET |

## 请求参数

### Query Parameters

| 参数 | 类型 | 必填 | 说明 | 默认值 |
| :- | :- | :- | :- | :- |
| page | int | 否 | 页码，从 0 开始 | 0 |
| per_page | int | 否 | 每页返回数量 | 10 |

## 响应数据

### 成功响应示例

```json
[
  {
    "uid": 123456789,
    "hash_id": "abc123",
    "fullname": "知乎用户",
    "gender": "male",
    "headline": "个人简介",
    "description": "个人描述",
    "avatar_path": "https://picx.zhimg.com/...",
    "url": "https://www.zhihu.com/people/abc123",
    "email": "",
    "phone_no": ""
  }
]
```

### 响应字段说明

返回值为用户对象数组，字段说明请参考 [快速开始](quickstart.md) 中的「用户对象字段说明」。

### 错误响应

> 公共错误（鉴权失败、权限不足等）请参考 [快速开始](quickstart.md) 中的公共错误响应。

## curl 示例

```bash
curl -s "https://openapi.zhihu.com/user/followees?page=0&per_page=10" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```
