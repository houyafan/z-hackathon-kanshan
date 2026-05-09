# 创建评论

## 接口说明
为想法创建一条评论（支持一级评论和回复评论）。

当前支持的圈子ID：`2001009660925334090`  
圈子链接：https://www.zhihu.com/ring/host/2001009660925334090

> [!WARNING]
> 👋 每小时每个想法下，最多20条。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://openapi.zhihu.com/openapi/comment/create |
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
| content_token | string | 是 | 内容ID（想法ID或评论ID） |
| content_type | string | 是 | 内容类型："pin"（想法）或 "comment"（评论） |
| content | string | 是 | 评论内容 |

## 响应数据

### 成功响应示例
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "comment_id": 789012
  }
}
```

### 失败响应示例
```json
{
  "code": 1,
  "msg": "pin_id is required",
  "data": null
}
```

### 响应字段说明
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| code | int | 状态码，0表示成功，1表示失败 |
| msg | string | 响应消息 |
| data | object | 响应数据 |
| comment_id | int64 | 创建成功后的评论ID |

## curl 示例

```bash
#!/bin/bash
# 评论创建脚本（支持一级评论和回复评论）
# 用法:
#   对想法发一级评论: ./post_comment.sh pin <pin_id> <content>
#   回复某条评论:     ./post_comment.sh comment <comment_id> <content>

set -e

# 配置信息
DOMAIN="https://openapi.zhihu.com"
APP_KEY=""
APP_SECRET=""

# 检查参数
if [ $# -lt 3 ]; then
    echo "用法:"
    echo "  对想法发一级评论: $0 pin <pin_id> <content>"
    echo "  回复某条评论:     $0 comment <comment_id> <content>"
    echo ""
    echo "示例:"
    echo "  $0 pin 2001614683480822500 '这是一条评论'"
    echo "  $0 comment 123456 '这是一条回复'"
    exit 1
fi

CONTENT_TYPE="$1"
CONTENT_TOKEN="$2"
CONTENT="$3"

# 生成时间戳和日志ID
TIMESTAMP=$(date +%s)
LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

# 生成签名
SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

# 构建请求体
if command -v jq &>/dev/null; then
    REQUEST_BODY=$(jq -n --arg token "$CONTENT_TOKEN" --arg type "$CONTENT_TYPE" --arg content "$CONTENT" '{content_token: $token, content_type: $type, content: $content}')
else
    CONTENT_ESC=$(echo -n "$CONTENT" | sed 's/\\/\\\\/g; s/"/\\"/g')
    REQUEST_BODY="{\"content_token\":\"${CONTENT_TOKEN}\",\"content_type\":\"${CONTENT_TYPE}\",\"content\":\"${CONTENT_ESC}\"}"
fi

# 发送请求
curl -s -X POST "${DOMAIN}/openapi/comment/create" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Sign: ${SIGNATURE}" \
  -H "X-Extra-Info: " \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY"
```

## 常见错误

| 错误信息 | 说明 |
| :- | :- |
| ring_id not in writable list | 圈子ID不在可写白名单内 |
| pin not bound to any ring | 想法未绑定到任何圈子 |
| pin does not belong to the specified ring | 想法不属于指定的圈子 |
| reply comment does not belong to the specified ring | 回复的评论不属于指定的圈子 |
