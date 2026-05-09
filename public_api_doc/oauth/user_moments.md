# 获取关注动态

## 接口说明

获取当前授权用户的关注动态（Feed）列表。

> Access Token 使用方式及通用分页参数请参考 [快速开始](quickstart.md)。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://openapi.zhihu.com/user/moments` |
| HTTP Method | GET |

## 请求参数

### Query Parameters

| 参数 | 类型 | 必填 | 说明 | 默认值 |
| :- | :- | :- | :- | :- |
| page | int | 否 | 页码，从 0 开始 | 0 |
| per_page | int | 否 | 每页数量，最大 50，总计最多查询 200 条 | 10 |

## 响应数据

### 成功响应示例

```json
{
  "data": [
    {
      "actor": {
        "name": "知乎用户"
      },
      "action_text": "回答了问题",
      "action_time": 1767928220,
      "target": {
        "title": "问题标题",
        "excerpt": "回答摘要",
        "author": {
          "name": "作者昵称"
        }
      }
    }
  ]
}
```

### 响应字段说明

| 字段 | 类型 | 说明 |
| :- | :- | :- |
| data | array | 动态列表 |
| data[].actor | object | 动作发起人信息 |
| data[].actor.name | string | 发起人昵称 |
| data[].action_text | string | 动作描述，如"回答了问题" |
| data[].action_time | int | 动作时间（Unix 时间戳） |
| data[].target | object | 动态目标内容 |
| data[].target.title | string | 内容标题 |
| data[].target.excerpt | string | 内容摘要 |
| data[].target.author | object | 内容作者信息 |
| data[].target.author.name | string | 作者昵称 |

### 错误响应

> 公共错误（鉴权失败、权限不足等）请参考 [快速开始](quickstart.md) 中的公共错误响应。

## curl 示例

```bash
curl -s "https://openapi.zhihu.com/user/moments?page=0&per_page=10" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```
