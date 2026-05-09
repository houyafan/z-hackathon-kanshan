# 获取故事内容详情

## 接口说明

根据作品 ID 获取会员小说的章节详情，包括章节名称、作者信息、导语和正文内容。

> 签名鉴权方式请参考 [快速开始](quickstart.md)。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://openapi.zhihu.com/openapi/hackthon_story/detail |
| HTTP Method | GET |

## 请求参数

### Query Parameters

| 参数名 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| work_id | int64 | 是 | 内容库中的作品 ID，如 `1644038836790169600` |

## 响应数据

### 成功响应示例

```json
{
  "status": 0,
  "msg": "success",
  "data": {
    "work_id": "1644038836790169600",
    "chapter_name": "第一章",
    "author_avatar": "https://picx.zhimg.com/...",
    "author_name": "六酒",
    "labels": ["史脑洞"],
    "introduction": "导语文本",
    "content": "第一段正文\n第二段正文"
  }
}
```

### 失败响应示例

```json
{
  "status": 1,
  "msg": "story not found",
  "data": null
}
```

```json
{
  "status": 1,
  "msg": "work_id is required",
  "data": null
}
```

### 响应字段说明

#### 顶层字段

| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| status | int | 状态码，0 表示成功，1 表示失败 |
| msg | string | 响应消息 |
| data | object | 响应数据 |

#### data 字段

| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| work_id | string | 作品 ID |
| chapter_name | string | 章节名称 |
| author_avatar | string | 作者头像 URL |
| author_name | string | 作者姓名 |
| labels | array[string] | 内容标签 |
| introduction | string | 导语 |
| content | string | 正文内容，保留段落换行，最多返回 3000 字 |

## 错误说明

| 场景 | 处理 |
| :- | :- |
| `work_id` 不在固定内容库中 | 返回 `story not found` |
| 内容服务查询失败 | 透传下游错误 |
| 作品或小节资源缺失 | 返回 `story not found` |

## curl 示例

```bash
curl -s "https://openapi.zhihu.com/openapi/hackthon_story/detail?work_id=1644038836790169600" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Sign: ${SIGN}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Extra-Info: "
```
