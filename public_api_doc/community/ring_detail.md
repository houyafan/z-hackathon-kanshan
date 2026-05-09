# 获取圈子详情

## 接口说明
获取指定圈子的详细信息和最新内容列表。

当前支持的圈子ID：`2001009660925334090`  
圈子链接：https://www.zhihu.com/ring/host/2001009660925334090

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://openapi.zhihu.com/openapi/ring/detail |
| HTTP Method | GET |

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

### Query Parameters

| 参数名 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| ring_id | string | 是 | 圈子ID |
| page_size | int | 否 | 每页条数，最多不超过50条 |
| page_num | int | 否 | 页数，默认：1 |

## 响应数据

### 响应示例
```json
{
    "status": 0,
    "msg": "success",
    "data": {
        "ring_info": {
            "ring_id": "1871220441579913217",
            "ring_name": "国产剧观察团",
            "ring_desc": "电视剧看了不讨论，约等于浅看...",
            "ring_avatar": "https://pica.zhimg.com/v2-c220c91df8f7a1ce04e18e3d1fb748c4.jpg",
            "membership_num": 19170,
            "discussion_num": 107184
        },
        "contents": [
            {
                "pin_id": 1992912496017834773,
                "content": "姚晨又给自己找麻烦了...",
                "author_name": "职场基本法",
                "images": [
                    "https://pic1.zhimg.com/v2-1342e27d6f36f1849e94e0024c68b883_1440w.jpg"
                ],
                "publish_time": 1767928220,
                "like_num": 102,
                "comment_num": 146,
                "share_num": 0,
                "fav_num": 11,
                "comments": [
                    {
                        "comment_id": 11388555101,
                        "content": "<p>你拍的好不就没人倍速看看么</p>",
                        "author_name": "小怪兽真好看",
                        "author_token": "jiang-rong-sheng-49",
                        "like_count": 123,
                        "reply_count": 5,
                        "publish_time": 1767949522
                    }
                ]
            }
        ]
    }
}
```

### 响应字段说明

#### 顶层字段
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| status | int | 状态码，0表示成功，1表示失败 |
| msg | string | 响应消息 |
| data | object | 响应数据 |

#### data 字段
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| ring_info | object | 圈子基本信息 |
| contents | array<object> | 圈子内容列表（最新发布，最多20条） |

#### ring_info 字段
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| ring_id | string | 圈子ID |
| ring_name | string | 圈子名称 |
| ring_desc | string | 圈子描述 |
| ring_avatar | string | 圈子头像URL |
| membership_num | int | 成员数量 |
| discussion_num | int | 讨论数量 |

#### contents 字段
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| pin_id | int64 | 内容ID |
| title | string | 标题（可能为空） |
| content | string | 内容正文 |
| author_name | string | 作者名称 |
| images | array[string] | 图片URL列表 |
| publish_time | int64 | 发布时间戳（秒） |
| like_num | int | 赞同数量 |
| comment_num | int | 评论数 |
| fav_num | int | 收藏数 |
| share_num | int | 分享数 |
| comments | array<object> | 评论内容列表 |

#### comments 字段
| 字段名 | 类型 | 说明 |
| :- | :- | :- |
| comment_id | int64 | 评论ID |
| content | string | 评论正文 |
| author_name | string | 评论人名 |
| author_token | string | 评论人token |
| like_count | int | 喜欢数 |
| reply_count | int | 回复数 |
| publish_time | int64 | 发布时间戳 |

## curl 示例

```bash
#!/bin/bash
# 圈子详情查询脚本
# 用法: ./ring_detail.sh <ring_id> [page_num] [page_size]

set -e

# 配置信息
DOMAIN="https://openapi.zhihu.com"
APP_KEY=""      # 用户token
APP_SECRET=""   # 知乎提供

# 检查参数
if [ $# -lt 1 ]; then
    echo "用法: $0 <ring_id> [page_num] [page_size]"
    exit 1
fi

RING_ID="$1"
PAGE_NUM="${2:-1}"
PAGE_SIZE="${3:-20}"

# 生成时间戳和日志ID
TIMESTAMP=$(date +%s)
LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

# 生成签名
SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

# 发送请求
curl "${DOMAIN}/openapi/ring/detail?ring_id=${RING_ID}&page_num=${PAGE_NUM}&page_size=${PAGE_SIZE}" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Sign: ${SIGNATURE}" \
  -H "X-Extra-Info: "
```
