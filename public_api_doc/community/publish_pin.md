# 发布想法

## 接口说明
在指定圈子中发布一条想法。

当前支持的圈子ID：`2001009660925334090`  
圈子链接：https://www.zhihu.com/ring/host/2001009660925334090

> [!WARNING]
> 👋 每小时最多5条。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://openapi.zhihu.com/openapi/publish/pin |
| HTTP Method | POST |

## 鉴权传参
- `app_key`: 传入用户 token
- `app_secret`: 应用密钥（请妥善保管，不要泄露），传入分配的 app_secret

## 请求参数

### Header
| 请求头 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| X-App-Key | string | 是 | 应用标识 |
| X-Timestamp | string | 是 | 当前时间戳（秒级） |
| X-Log-Id | string | 是 | 请求日志 ID |
| X-Sign | string | 是 | 签名 |
| X-Extra-Info | string | 是 | 额外信息，可为空 |
| Content-Type | string | 是 | application/json |

### Request Body (JSON)

| 参数名 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| title | string | 否 | 内容标题 |
| content | string | 是 | 内容正文(文本) |
| image_urls | []string | 否 | 图片列表 |
| ring_id | string | 是 | 圈子ID |

## 响应数据

### 成功响应示例
```json
{
  "status": 0,
  "msg": "success",
  "data": {
    "content_token": "1980374952797546340"
  }
}
```

### 失败响应示例
```json
{
  "status": 1,
  "msg": "title is required",
  "data": null
}
```

### 响应字段说明
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| status | int | 状态码，0表示成功，1表示失败 |
| msg | string | 响应消息 |
| data | object | 响应数据 |
| content_token | string | 发布成功后的想法token |

## curl 示例

```bash
#!/bin/bash

APP_KEY="your_app_key"      # 用户token
APP_SECRET="your_app_secret" # 知乎提供
RING_ID="2001009660925334090"
DOMAIN="https://openapi.zhihu.com"

TIMESTAMP=$(date +%s)
LOG_ID="test-${TIMESTAMP}"

# 生成签名
SIGN_STR="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGN=$(echo -n "$SIGN_STR" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

JSON_DATA=$(cat <<EOF
{
    "title": "测试标题",
    "content":"看看接下来会发生什么,一起见证",
    "image_urls": ["https://picx.zhimg.com/v2-11ab7c0425d7c30245fb98669abf2e6f_720w.jpg"],
    "ring_id": "${RING_ID}"
}
EOF
)

curl -X POST "${DOMAIN}/openapi/publish/pin" \
     -H "X-App-Key: ${APP_KEY}" \
     -H "X-Timestamp: ${TIMESTAMP}" \
     -H "X-Sign: ${SIGN}" \
     -H "X-Log-Id: ${LOG_ID}" \
     -H "X-Extra-Info: " \
     -H "Content-Type: application/json" \
     -d "$JSON_DATA"
```
