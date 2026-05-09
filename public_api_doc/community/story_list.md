# 获取故事内容概要列表

## 接口说明

获取会员小说开放内容库的故事概要列表，返回顺序与内容库固定表顺序一致，特对2026年黑客松活动特殊开放。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://openapi.zhihu.com/openapi/hackthon_story/list |
| HTTP Method | GET |

## 请求参数

无。

## 响应数据

### 成功响应示例

```json
{
  "status": 0,
  "msg": "success",
  "data": [
    {
      "work_id": "1644038836790169600",
      "title": "秦始皇登月计划",
      "artwork": "https://picx.zhimg.com/...",
      "tab_artwork": "https://picx.zhimg.com/...",
      "description": "作品简介文本",
      "labels": ["史脑洞"]
    },
    {
      "work_id": "1487746545537290240",
      "title": "人脸解锁失败",
      "artwork": "https://picx.zhimg.com/...",
      "tab_artwork": "https://picx.zhimg.com/...",
      "description": "作品简介文本",
      "labels": ["悬疑"]
    }
  ]
}
```

### 失败响应示例

```json
{
  "status": 1,
  "msg": "failed to get story list",
  "data": null
}
```

### 响应字段说明

#### 顶层字段

| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| status | int | 状态码，0 表示成功，1 表示失败 |
| msg | string | 响应消息 |
| data | array | 故事概要列表 |

#### data 数组中的对象字段

| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| work_id | string | 作品 ID，用于详情接口入参 |
| title | string | 作品名称 |
| artwork | string | 横版封面图 URL |
| tab_artwork | string | 竖版封面图 URL |
| description | string | 作品简介 |
| labels | array[string] | 内容标签 |

## curl 示例

```bash
curl -s "https://openapi.zhihu.com/openapi/hackthon_story/list" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Sign: ${SIGN}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Extra-Info: "
```
