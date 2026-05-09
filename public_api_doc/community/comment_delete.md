# 删除评论

## 接口说明
删除自己发布的评论。

当前支持的圈子ID：`2001009660925334090`  
圈子链接：https://www.zhihu.com/ring/host/2001009660925334090

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://openapi.zhihu.com/openapi/comment/delete |
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
| comment_id | string | 是 | 评论ID |

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
    "msg": "cannot delete other's comment",
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
# 删除评论脚本
# 用法: ./delete_comment.sh <comment_id>

set -e

# 配置信息
DOMAIN="https://openapi.zhihu.com"
APP_KEY=""      # 用户token
APP_SECRET=""   # 知乎提供

# 检查参数
if [ $# -lt 1 ]; then
    echo "用法: $0 <comment_id>"
    echo ""
    echo "参数:"
    echo "  comment_id  评论ID (必填)"
    echo ""
    echo "示例:"
    echo "  $0 11408509968"
    exit 1
fi

COMMENT_ID="$1"

# 生成时间戳和日志ID
TIMESTAMP=$(date +%s)
LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

# 生成签名
SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

# 构建请求体
JSON_DATA="{\"comment_id\":\"${COMMENT_ID}\"}"

# 发送请求
curl -s -X POST "${DOMAIN}/openapi/comment/delete" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Sign: ${SIGNATURE}" \
  -H "X-Extra-Info: " \
  -H "Content-Type: application/json" \
  -d "$JSON_DATA"
```

## 常见错误

| msg | 说明 |
| :- | :- |
| comment_id is required | 缺少评论ID参数 |
| invalid comment_id | 评论ID格式无效 |
| comment not found | 评论不存在 |
| cannot delete other's comment | 不能删除他人的评论 |
| comment's ring not in writable list | 评论所属圈子不在可写白名单内 |
