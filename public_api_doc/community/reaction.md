# 内容/评论点赞

## 接口说明
对想法或评论进行点赞/取消点赞操作。

当前支持的圈子ID：`2001009660925334090`  
圈子链接：https://www.zhihu.com/ring/host/2001009660925334090

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://openapi.zhihu.com/openapi/reaction |
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
| action_type | string | 是 | 操作类型："like"（点赞） |
| action_value | int | 是 | 操作值：1 操作 0 取消操作<br>举例：当action_type为like时，1表示点赞，0表示取消点赞 |

## 响应数据

### 成功响应示例
```json
{
    "status": 0,
    "msg": "success",
    "data": {
      "success": true
    }
}
```

### 失败响应示例
```json
{
    "status": 1,
    "msg": "content not found or not bound to any ring",
    "data": null
}
```

### 响应字段说明
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| status | int | 状态码，0表示成功，1表示失败 |
| msg | string | 响应消息 |
| data | object | 响应数据 |
| success | bool | 操作是否成功 |

## curl 示例

```bash
#!/bin/bash
# 点赞/取消点赞脚本
# 用法: ./reaction.sh <content_type> <content_token> <action_value>

set -e

# 配置信息
DOMAIN="https://openapi.zhihu.com"
APP_KEY=""      # 用户token
APP_SECRET=""   # 知乎提供

# 检查参数
if [ $# -lt 3 ]; then
    echo "用法: $0 <content_type> <content_token> <action_value>"
    echo ""
    echo "参数:"
    echo "  content_type   内容类型: pin 或 comment"
    echo "  content_token  内容ID"
    echo "  action_value   1=点赞, 0=取消点赞"
    echo ""
    echo "示例:"
    echo "  $0 pin 2001614683480822500 1      # 对想法点赞"
    echo "  $0 pin 2001614683480822500 0      # 取消想法点赞"
    echo "  $0 comment 11407772941 1          # 对评论点赞"
    echo "  $0 comment 11407772941 0          # 取消评论点赞"
    exit 1
fi

CONTENT_TYPE="$1"
CONTENT_TOKEN="$2"
ACTION_VALUE="$3"

# 生成时间戳和日志ID
TIMESTAMP=$(date +%s)
LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

# 生成签名
SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

# 构建请求体
JSON_DATA=$(cat <<EOF
{
    "content_token": "${CONTENT_TOKEN}",
    "content_type": "${CONTENT_TYPE}",
    "action_type": "like",
    "action_value": ${ACTION_VALUE}
}
EOF
)

# 发送请求
curl -s -X POST "${DOMAIN}/openapi/reaction" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Sign: ${SIGNATURE}" \
  -H "X-Extra-Info: " \
  -H "Content-Type: application/json" \
  -d "$JSON_DATA"
```

## 注意事项
- 仅支持对白名单圈子内的内容进行点赞操作
- 评论点赞时，会校验评论所属想法是否属于白名单圈子
