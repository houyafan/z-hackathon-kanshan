#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, unquote, urlparse
from urllib.request import Request, urlopen
import hashlib
import json
import mimetypes
import os
import secrets
import sqlite3
from datetime import datetime, timedelta


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("DB_PATH") or ROOT / "db" / "sqlite" / "liukanshan_p0.sqlite")
INIT_SQL = ROOT / "db" / "sqlite" / "init_p0.sql"
STATIC_DIR = ROOT / "p0_mock" / "static"
ROAMING_DIR = ROOT / "3d-liukanshan-roaming"
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH") or ROOT / "p0_mock" / "config.json")
BUNDLED_CONFIG_PATH = ROOT / "p0_mock" / "config.json"
DEFAULT_USER_ID = 10001
SESSION_COOKIE_NAME = "lks_session"


def env_bool(name):
    value = os.environ.get(name)
    if value is None:
        return None
    return value.strip().lower() in ("1", "true", "yes", "on")


def apply_env_overrides(config):
    string_overrides = {
        "auth_mode": "AUTH_MODE",
        "zhihu_openapi_base": "ZH_OPENAPI_BASE",
        "zhihu_app_id": "ZH_APP_ID",
        "zhihu_app_key": "ZH_APP_KEY",
        "zhihu_auth_redirect_uri": "ZH_AUTH_REDIRECT_URI",
    }
    for key, env_name in string_overrides.items():
        value = os.environ.get(env_name)
        if value:
            config[key] = value

    public_base_url = os.environ.get("PUBLIC_BASE_URL")
    if public_base_url and not os.environ.get("ZH_AUTH_REDIRECT_URI"):
        config["zhihu_auth_redirect_uri"] = f"{public_base_url.rstrip('/')}/auth/callback"

    int_overrides = {
        "session_ttl_hours": "SESSION_TTL_HOURS",
        "state_ttl_minutes": "STATE_TTL_MINUTES",
    }
    for key, env_name in int_overrides.items():
        value = os.environ.get(env_name)
        if value:
            config[key] = int(value)

    local_auth_bypass = env_bool("LOCAL_AUTH_BYPASS")
    if local_auth_bypass is not None:
        config["local_auth_bypass"] = local_auth_bypass

    return config


def load_config():
    default_config = {
        "auth_mode": "mock",
        "zhihu_openapi_base": "https://openapi.zhihu.com",
        "zhihu_app_id": "",
        "zhihu_app_key": "",
        "zhihu_auth_redirect_uri": "http://127.0.0.1:5173/auth/callback",
        "session_ttl_hours": 24,
        "state_ttl_minutes": 10,
        "local_auth_bypass": False,
        "mock_user": {
            "uid": DEFAULT_USER_ID,
            "fullname": "看山七子",
            "gender": "unknown",
            "headline": "让复杂讨论被看见结构，而非淹没在情绪中。",
            "description": "刘看山虚拟宠物 P0 本地调试用户",
            "avatar_path": "",
            "phone_no": "",
            "email": "",
        },
    }
    config_path = CONFIG_PATH
    if not config_path.exists() and config_path != BUNDLED_CONFIG_PATH and BUNDLED_CONFIG_PATH.exists():
        config_path = BUNDLED_CONFIG_PATH
    if not config_path.exists():
        return apply_env_overrides(default_config)
    with config_path.open("r", encoding="utf-8") as file:
        user_config = json.load(file)
    merged = {**default_config, **user_config}
    merged["mock_user"] = {**default_config["mock_user"], **user_config.get("mock_user", {})}
    return apply_env_overrides(merged)


CONFIG = load_config()
ZH_OPENAPI_BASE = CONFIG["zhihu_openapi_base"].rstrip("/")
ZH_APP_ID = str(CONFIG.get("zhihu_app_id") or "")
ZH_APP_KEY = str(CONFIG.get("zhihu_app_key") or "")
ZH_AUTH_REDIRECT_URI = str(CONFIG.get("zhihu_auth_redirect_uri") or "http://127.0.0.1:5173/auth/callback")
AUTH_MODE = str(CONFIG.get("auth_mode") or ("oauth" if ZH_APP_ID and ZH_APP_KEY else "mock")).lower()
MOCK_USER = CONFIG["mock_user"]
SESSION_TTL_HOURS = int(CONFIG.get("session_ttl_hours") or 24)
STATE_TTL_MINUTES = int(CONFIG.get("state_ttl_minutes") or 10)
LOCAL_AUTH_BYPASS = bool(CONFIG.get("local_auth_bypass"))
FOLLOW_MOMENT_EXP = 2
FOLLOW_MOMENT_MAX_EXP_PER_SYNC = 10
FOLLOW_MOMENT_MOOD = 1
FOLLOW_MOMENT_MAX_MOOD_PER_SYNC = 5
TRAVEL_MIN_SATIETY = 60
TRAVEL_DEFAULT_ENERGY_COST = 10
TRAVEL_COOLDOWN_MINUTES = 10
TRAVEL_CLAIM_EXP = 8
TRAVEL_CLAIM_MOOD = 5
TRAVEL_CLAIM_ENERGY = 1
TRAVEL_THEME_MESSAGES = {
    "arctic": {
        "title": "北极远行",
        "start": "看山踏上北极探险之路，去寻找冷门硬核干货。",
        "return": "冰川里挖到一篇硬核科普，小众又干货，主人一定会喜欢。",
        "route": "北极冰原 -> 冷知识雪丘 -> 极光书库",
        "quote": "我在冰川下面翻到一束很亮的知识光。",
        "cover": "arctic",
    },
    "mountain": {
        "title": "山海漫游",
        "start": "看山去山海间旅行啦，正在为你寻觅沿途的优质文章。",
        "return": "主人，我从山间归来，带回了一篇很适合慢慢读的风物文章。",
        "route": "山间小路 -> 湖畔书亭 -> 风物驿站",
        "quote": "山风翻页的时候，我替你按住了最好看的那一页。",
        "cover": "mountain",
    },
}


def now_text():
    return datetime.now().isoformat(timespec="seconds")


def future_text(**kwargs):
    return (datetime.now() + timedelta(**kwargs)).isoformat(timespec="seconds")


def parse_time(value):
    if not value:
        return datetime.min
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.min


def safe_next_url(value):
    if not value:
        return "/"
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return "/"
    if not value.startswith("/"):
        return "/"
    if value.startswith("//"):
        return "/"
    return value


def cache_control_for(path):
    if path.name == "index.html":
        return "no-store"
    if path.suffix == ".glb":
        return "public, max-age=31536000, immutable"
    if path.suffix in (".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"):
        return "public, max-age=86400"
    return "no-store"


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as conn:
        conn.executescript(INIT_SQL.read_text(encoding="utf-8"))
        migrate_db(conn)


def column_names(conn, table_name):
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()}


def add_column_if_missing(conn, table_name, column_name, definition):
    if column_name in column_names(conn, table_name):
        return
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def migrate_db(conn):
    add_column_if_missing(conn, "pet_profile", "health", "INTEGER NOT NULL DEFAULT 100 CHECK (health BETWEEN 0 AND 100)")
    add_column_if_missing(conn, "pet_profile", "travel_energy", "INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy >= 0)")
    add_column_if_missing(conn, "pet_profile", "travel_status", "TEXT NOT NULL DEFAULT 'home'")
    add_column_if_missing(conn, "pet_profile", "current_travel_id", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_profile", "cooldown_until", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_profile", "last_travel_at", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_content_event", "travel_energy_reward", "INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy_reward >= 0)")
    add_column_if_missing(conn, "pet_daily_stat", "travel_energy_gained", "INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy_gained >= 0)")


def row_to_dict(row):
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def camel_user(row):
    if row is None:
        return None
    return {
        "userId": row["uid"],
        "uid": row["uid"],
        "fullname": row["fullname"],
        "gender": row["gender"],
        "headline": row["headline"],
        "description": row["description"],
        "avatarPath": row["avatar_path"],
        "phoneNo": row["phone_no"],
        "email": row["email"],
        "lastLoginAt": row["last_login_at"],
    }


def camel_profile(row, user_id=DEFAULT_USER_ID):
    if row is None:
        return {
            "userId": user_id,
            "adopted": False,
        }
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "adopted": bool(row["adopted"]),
        "petName": row["pet_name"],
        "level": row["level"],
        "stage": row["stage"],
        "totalExp": row["total_exp"],
        "satiety": row["satiety"],
        "mood": row["mood"],
        "health": row["health"],
        "travelEnergy": row["travel_energy"],
        "travelStatus": row["travel_status"],
        "currentTravelId": row["current_travel_id"],
        "cooldownUntil": row["cooldown_until"],
        "lastTravelAt": row["last_travel_at"],
        "totalReadCount": row["total_read_count"],
        "totalWatchCount": row["total_watch_count"],
        "totalInteractionCount": row["total_interaction_count"],
        "lastGrowthAt": row["last_growth_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def parse_json_array(value):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def camel_content(row, include_full=False):
    if row is None:
        return None
    content = {
        "id": row["content_id"],
        "type": row["content_type"],
        "action": "watch" if row["content_type"] == "video" else "read",
        "title": row["title"],
        "author": row["author"],
        "excerpt": row["excerpt"],
        "readText": row["read_text"],
        "tags": parse_json_array(row["tags"]),
        "media": row["media_type"],
        "mediaLabel": row["media_label"],
        "counts": {
            "like": row["like_count"],
            "comment": row["comment_count"],
            "collect": row["collect_count"],
        },
        "publishedAt": row["published_at"],
    }
    if include_full:
        content["fullContent"] = row["full_content"]
    return content


def camel_follow_moment(row):
    if row is None:
        return None
    return {
        "id": row["id"],
        "momentKey": row["moment_key"],
        "actorName": row["actor_name"],
        "actionText": row["action_text"],
        "actionTime": row["action_time"],
        "targetTitle": row["target_title"],
        "targetExcerpt": row["target_excerpt"],
        "targetAuthorName": row["target_author_name"],
        "llmSummaryStatus": row["llm_summary_status"],
        "llmSummary": row["llm_summary"],
        "llmSummaryModel": row["llm_summary_model"],
        "notifiedAt": row["notified_at"],
        "firstSeenAt": row["first_seen_at"],
    }


def fetch_user(conn, user_id):
    return conn.execute(
        "SELECT * FROM zhihu_user WHERE uid = ?",
        (user_id,),
    ).fetchone()


def upsert_zhihu_user(conn, user):
    uid = int(user.get("uid") or user.get("userId"))
    fullname = str(user.get("fullname") or "知乎用户")
    conn.execute(
        """
        INSERT INTO zhihu_user
          (uid, fullname, gender, headline, description, avatar_path, phone_no, email,
           last_login_at, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
          fullname = excluded.fullname,
          gender = excluded.gender,
          headline = excluded.headline,
          description = excluded.description,
          avatar_path = excluded.avatar_path,
          phone_no = excluded.phone_no,
          email = excluded.email,
          last_login_at = excluded.last_login_at,
          updated_at = excluded.updated_at
        """,
        (
            uid,
            fullname,
            user.get("gender"),
            user.get("headline"),
            user.get("description"),
            user.get("avatar_path") or user.get("avatarPath"),
            user.get("phone_no") or user.get("phoneNo"),
            user.get("email"),
            now_text(),
            now_text(),
            now_text(),
        ),
    )
    return fetch_user(conn, uid)


def save_oauth_token(conn, user_id, token):
    expires_in = int(token.get("expires_in") or 3600)
    conn.execute(
        """
        INSERT INTO zhihu_oauth_token
          (user_id, access_token, token_type, expires_at, scope, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          access_token = excluded.access_token,
          token_type = excluded.token_type,
          expires_at = excluded.expires_at,
          scope = excluded.scope,
          updated_at = excluded.updated_at
        """,
        (
            user_id,
            token["access_token"],
            token.get("token_type") or "Bearer",
            future_text(seconds=expires_in),
            token.get("scope"),
            now_text(),
            now_text(),
        ),
    )


def create_session(conn, user_id):
    session_id = secrets.token_urlsafe(32)
    conn.execute(
        """
        INSERT INTO auth_session
          (session_id, user_id, expires_at, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?)
        """,
        (session_id, user_id, future_text(hours=SESSION_TTL_HOURS), now_text(), now_text()),
    )
    return session_id


def fetch_session(conn, session_id):
    if not session_id:
        return None
    row = conn.execute(
        """
        SELECT s.*, u.fullname, u.avatar_path, u.headline
        FROM auth_session s
        JOIN zhihu_user u ON u.uid = s.user_id
        WHERE s.session_id = ?
        """,
        (session_id,),
    ).fetchone()
    if row is None:
        return None
    if parse_time(row["expires_at"]) <= datetime.now():
        conn.execute("DELETE FROM auth_session WHERE session_id = ?", (session_id,))
        return None
    if AUTH_MODE == "oauth" and int(row["user_id"]) == DEFAULT_USER_ID:
        conn.execute("DELETE FROM auth_session WHERE session_id = ?", (session_id,))
        return None
    if AUTH_MODE == "oauth" and fetch_oauth_token(conn, row["user_id"]) is None:
        conn.execute("DELETE FROM auth_session WHERE session_id = ?", (session_id,))
        return None
    return row


def create_oauth_state(conn, next_url):
    state = secrets.token_urlsafe(24)
    conn.execute(
        """
        INSERT INTO oauth_state
          (state, next_url, expires_at, created_at)
        VALUES
          (?, ?, ?, ?)
        """,
        (state, safe_next_url(next_url), future_text(minutes=STATE_TTL_MINUTES), now_text()),
    )
    return state


def consume_oauth_state(conn, state):
    row = conn.execute(
        """
        SELECT *
        FROM oauth_state
        WHERE state = ? AND consumed_at IS NULL
        """,
        (state,),
    ).fetchone()
    if row is None or parse_time(row["expires_at"]) <= datetime.now():
        return None
    conn.execute(
        "UPDATE oauth_state SET consumed_at = ? WHERE state = ?",
        (now_text(), state),
    )
    return row


def exchange_access_token(code):
    body = urlencode({
        "app_id": ZH_APP_ID,
        "app_key": ZH_APP_KEY,
        "grant_type": "authorization_code",
        "redirect_uri": ZH_AUTH_REDIRECT_URI,
        "code": code,
    }).encode("utf-8")
    request = Request(
        f"{ZH_OPENAPI_BASE}/access_token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    token_payload = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if token_payload.get("access_token"):
        return token_payload
    if payload.get("code"):
        raise RuntimeError(str(payload.get("data") or payload))
    if not token_payload.get("access_token"):
        raise RuntimeError("知乎 OAuth 未返回 access_token")
    return token_payload


def fetch_zhihu_user(access_token):
    request = Request(
        f"{ZH_OPENAPI_BASE}/user",
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    with urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    user_payload = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if user_payload.get("uid"):
        return user_payload
    if payload.get("code"):
        raise RuntimeError(str(payload.get("data") or payload))
    if not user_payload.get("uid"):
        raise RuntimeError("知乎 OAuth 未返回用户 uid")
    return user_payload


def fetch_oauth_token(conn, user_id):
    row = conn.execute(
        "SELECT * FROM zhihu_oauth_token WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is None or parse_time(row["expires_at"]) <= datetime.now():
        return None
    return row


def fetch_zhihu_moments(access_token, page=0, per_page=10):
    params = urlencode({"page": page, "per_page": per_page})
    request = Request(
        f"{ZH_OPENAPI_BASE}/user/moments?{params}",
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    with urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    moments_payload = payload.get("data") if isinstance(payload.get("data"), list) else payload
    if isinstance(moments_payload, list):
        return moments_payload
    if payload.get("code") and payload.get("code") not in (0, 20000):
        raise RuntimeError(str(payload.get("data") or payload))
    return []


def mock_zhihu_user():
    return {
        "uid": int(MOCK_USER.get("uid") or DEFAULT_USER_ID),
        "fullname": MOCK_USER.get("fullname") or "看山七子",
        "gender": MOCK_USER.get("gender") or "unknown",
        "headline": MOCK_USER.get("headline") or "",
        "description": MOCK_USER.get("description") or "",
        "avatar_path": MOCK_USER.get("avatar_path") or "",
        "phone_no": MOCK_USER.get("phone_no") or "",
        "email": MOCK_USER.get("email") or "",
    }


def fetch_profile(conn, user_id):
    return conn.execute(
        "SELECT * FROM pet_profile WHERE user_id = ?",
        (user_id,),
    ).fetchone()


def fetch_contents(conn, limit=20):
    return conn.execute(
        """
        SELECT *
        FROM zhihu_content_pool
        WHERE status = 'published'
        ORDER BY hot_score DESC, published_at DESC, id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def fetch_content(conn, content_id):
    return conn.execute(
        """
        SELECT *
        FROM zhihu_content_pool
        WHERE content_id = ? AND status = 'published'
        """,
        (content_id,),
    ).fetchone()


def increment_content_counter(conn, content_id, action_type):
    counter_by_action = {
        "like": "like_count",
        "comment": "comment_count",
        "collect": "collect_count",
    }
    counter_column = counter_by_action.get(action_type)
    if not counter_column or not content_id:
        return
    conn.execute(
        f"""
        UPDATE zhihu_content_pool
        SET {counter_column} = {counter_column} + 1,
            updated_at = ?
        WHERE content_id = ?
        """,
        (now_text(), content_id),
    )


def fetch_level(conn, total_exp):
    return conn.execute(
        """
        SELECT level, stage
        FROM pet_level_config
        WHERE required_total_exp <= ?
        ORDER BY level DESC
        LIMIT 1
        """,
        (total_exp,),
    ).fetchone()


def calculate_reward(content_type, action_type):
    if action_type == "like":
        return {"exp": 1, "satiety": 0, "mood": 3, "travelEnergy": 1}
    if action_type == "collect":
        return {"exp": 2, "satiety": 0, "mood": 5, "travelEnergy": 1}
    if action_type == "comment":
        return {"exp": 3, "satiety": 0, "mood": 8, "travelEnergy": 1}
    if content_type == "article" and action_type == "read":
        return {"exp": 5, "satiety": 5, "mood": 0, "travelEnergy": 1}
    if content_type == "pin" and action_type == "read":
        return {"exp": 3, "satiety": 3, "mood": 0, "travelEnergy": 1}
    if content_type == "video" and action_type == "watch":
        return {"exp": 8, "satiety": 5, "mood": 0, "travelEnergy": 1}
    if content_type == "novel" and action_type == "read":
        return {"exp": 10, "satiety": 6, "mood": 0, "travelEnergy": 2}
    return {"exp": 0, "satiety": 0, "mood": 0, "travelEnergy": 0}


def moment_text_value(value):
    return str(value or "").strip()


def normalize_moment(moment):
    actor = moment.get("actor") if isinstance(moment.get("actor"), dict) else {}
    target = moment.get("target") if isinstance(moment.get("target"), dict) else {}
    author = target.get("author") if isinstance(target.get("author"), dict) else {}
    normalized = {
        "actor_name": moment_text_value(actor.get("name")),
        "action_text": moment_text_value(moment.get("action_text")),
        "action_time": int(moment.get("action_time") or 0),
        "target_title": moment_text_value(target.get("title")),
        "target_excerpt": moment_text_value(target.get("excerpt")),
        "target_author_name": moment_text_value(author.get("name")),
    }
    key_payload = {
        "actor": normalized["actor_name"],
        "action": normalized["action_text"],
        "time": normalized["action_time"],
        "title": normalized["target_title"],
        "excerpt": normalized["target_excerpt"],
        "author": normalized["target_author_name"],
    }
    normalized["moment_key"] = hashlib.sha256(
        json.dumps(key_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    normalized["raw_payload"] = json.dumps(moment, ensure_ascii=False, sort_keys=True)
    return normalized


def write_growth_log(conn, user_id, source_id, change_type, delta, before_value, after_value, reason, source_type="content_event"):
    if str(before_value) == str(after_value):
        return
    conn.execute(
        """
        INSERT INTO pet_growth_log
          (user_id, source_type, source_id, change_type, delta, before_value, after_value, reason, created_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, source_type, source_id, change_type, delta, before_value, after_value, reason, now_text()),
    )


def apply_follow_moment_reward(conn, user_id, new_count):
    profile = fetch_profile(conn, user_id)
    if profile is None or not profile["adopted"] or new_count <= 0:
        return {
            "exp": 0,
            "satiety": 0,
            "mood": 0,
            "levelUp": False,
            "stageChanged": False,
        }, camel_profile(profile, user_id)

    exp_reward = min(new_count * FOLLOW_MOMENT_EXP, FOLLOW_MOMENT_MAX_EXP_PER_SYNC)
    mood_reward = min(new_count * FOLLOW_MOMENT_MOOD, FOLLOW_MOMENT_MAX_MOOD_PER_SYNC)
    old = profile
    new_total_exp = old["total_exp"] + exp_reward
    new_mood = min(100, old["mood"] + mood_reward)
    level_row = fetch_level(conn, new_total_exp)
    new_level = level_row["level"] if level_row else old["level"]
    new_stage = level_row["stage"] if level_row else old["stage"]
    source_id = f"follow_moments:{int(datetime.now().timestamp() * 1000)}"

    conn.execute(
        """
        UPDATE pet_profile
        SET total_exp = ?,
            mood = ?,
            level = ?,
            stage = ?,
            last_growth_at = ?,
            updated_at = ?
        WHERE user_id = ?
        """,
        (new_total_exp, new_mood, new_level, new_stage, now_text(), now_text(), user_id),
    )

    write_growth_log(
        conn,
        user_id,
        source_id,
        "total_exp",
        exp_reward,
        old["total_exp"],
        new_total_exp,
        "关注动态提醒获得经验",
        "manual",
    )
    write_growth_log(
        conn,
        user_id,
        source_id,
        "mood",
        mood_reward,
        old["mood"],
        new_mood,
        "关注动态提醒提升心情",
        "manual",
    )
    if new_level != old["level"]:
        write_growth_log(conn, user_id, source_id, "level", new_level - old["level"], old["level"], new_level, "关注动态提醒触发升级", "manual")
    if new_stage != old["stage"]:
        write_growth_log(conn, user_id, source_id, "stage", 0, old["stage"], new_stage, "等级变化触发阶段切换", "manual")

    return {
        "exp": exp_reward,
        "satiety": 0,
        "mood": mood_reward,
        "levelUp": new_level != old["level"],
        "fromLevel": old["level"],
        "toLevel": new_level,
        "stageChanged": new_stage != old["stage"],
        "fromStage": old["stage"],
        "toStage": new_stage,
    }, camel_profile(fetch_profile(conn, user_id), user_id)


def sync_follow_moments(user_id, page=0, per_page=10):
    page = max(0, int(page))
    per_page = max(1, min(int(per_page), 50))
    with connect_db() as conn:
        token = fetch_oauth_token(conn, user_id)
        if token is None:
            return 409, {
                "error": "OAUTH_TOKEN_REQUIRED",
                "message": "缺少知乎 OAuth token，请重新登录",
            }

    try:
        moments = fetch_zhihu_moments(token["access_token"], page=page, per_page=per_page)
    except Exception as error:
        with connect_db() as conn:
            conn.execute(
                """
                INSERT INTO zhihu_follow_moment_sync
                  (user_id, last_synced_at, last_new_count, last_error, created_at, updated_at)
                VALUES
                  (?, ?, 0, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  last_synced_at = excluded.last_synced_at,
                  last_new_count = 0,
                  last_error = excluded.last_error,
                  updated_at = excluded.updated_at
                """,
                (user_id, now_text(), str(error), now_text(), now_text()),
            )
        return 502, {"error": "FOLLOW_MOMENTS_SYNC_FAILED", "message": str(error)}

    new_keys = []
    newest_action_time = None
    with connect_db() as conn:
        conn.execute("BEGIN")
        for moment in moments:
            normalized = normalize_moment(moment)
            newest_action_time = max(newest_action_time or 0, normalized["action_time"])
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO zhihu_follow_moment
                  (user_id, moment_key, actor_name, action_text, action_time,
                   target_title, target_excerpt, target_author_name, raw_payload,
                   llm_summary_status, created_at, updated_at)
                VALUES
                  (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (
                    user_id,
                    normalized["moment_key"],
                    normalized["actor_name"],
                    normalized["action_text"],
                    normalized["action_time"],
                    normalized["target_title"],
                    normalized["target_excerpt"],
                    normalized["target_author_name"],
                    normalized["raw_payload"],
                    now_text(),
                    now_text(),
                ),
            )
            if cursor.rowcount:
                new_keys.append(normalized["moment_key"])

        new_count = len(new_keys)
        reward_count = 0
        if new_keys:
            placeholders = ",".join("?" for _ in new_keys)
            reward_count = conn.execute(
                f"""
                SELECT COUNT(*)
                FROM zhihu_follow_moment
                WHERE user_id = ?
                  AND moment_key IN ({placeholders})
                  AND reward_granted = 0
                """,
                (user_id, *new_keys),
            ).fetchone()[0]

        reward, profile = apply_follow_moment_reward(conn, user_id, reward_count)
        if new_keys and (reward["exp"] or reward["mood"]):
            placeholders = ",".join("?" for _ in new_keys)
            conn.execute(
                f"""
                UPDATE zhihu_follow_moment
                SET reward_granted = 1,
                    updated_at = ?
                WHERE user_id = ? AND moment_key IN ({placeholders})
                """,
                (now_text(), user_id, *new_keys),
            )

        alert_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM zhihu_follow_moment
            WHERE user_id = ? AND notified_at IS NULL
            """,
            (user_id,),
        ).fetchone()[0]
        latest_alert = conn.execute(
            """
            SELECT *
            FROM zhihu_follow_moment
            WHERE user_id = ? AND notified_at IS NULL
            ORDER BY action_time DESC, id DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        conn.execute(
            """
            INSERT INTO zhihu_follow_moment_sync
              (user_id, last_synced_at, last_seen_action_time, last_new_count, last_error, created_at, updated_at)
            VALUES
              (?, ?, ?, ?, NULL, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              last_synced_at = excluded.last_synced_at,
              last_seen_action_time = CASE
                WHEN excluded.last_seen_action_time IS NULL THEN zhihu_follow_moment_sync.last_seen_action_time
                WHEN zhihu_follow_moment_sync.last_seen_action_time IS NULL THEN excluded.last_seen_action_time
                ELSE MAX(zhihu_follow_moment_sync.last_seen_action_time, excluded.last_seen_action_time)
              END,
              last_new_count = excluded.last_new_count,
              last_error = NULL,
              updated_at = excluded.updated_at
            """,
            (user_id, now_text(), newest_action_time, new_count, now_text(), now_text()),
        )
        conn.commit()

        return 200, {
            "newCount": alert_count,
            "syncedNewCount": new_count,
            "latestMoment": camel_follow_moment(latest_alert),
            "reward": reward,
            "profile": profile,
            "llm": {
                "summaryPlanned": True,
                "summaryStatus": latest_alert["llm_summary_status"] if latest_alert else "skipped",
                "summary": latest_alert["llm_summary"] if latest_alert else None,
            },
        }


def mark_follow_moments_notified(user_id):
    with connect_db() as conn:
        cursor = conn.execute(
            """
            UPDATE zhihu_follow_moment
            SET notified_at = ?,
                updated_at = ?
            WHERE user_id = ? AND notified_at IS NULL
            """,
            (now_text(), now_text(), user_id),
        )
        return 200, {"markedCount": cursor.rowcount}


def apply_content_event(payload, user_id):
    event_id = str(payload.get("eventId") or f"evt_{int(datetime.now().timestamp() * 1000)}")
    content_id = str(payload.get("contentId") or "")
    content_type = str(payload.get("contentType") or "")
    action_type = str(payload.get("actionType") or "")
    occurred_at = str(payload.get("occurredAt") or now_text())
    completion_ratio = payload.get("completionRatio")
    duration_sec = payload.get("durationSec")
    content_tags = payload.get("contentTags")
    tags_text = json.dumps(content_tags, ensure_ascii=False) if content_tags is not None else None
    reward = calculate_reward(content_type, action_type)

    with connect_db() as conn:
        profile = fetch_profile(conn, user_id)
        if profile is None or not profile["adopted"]:
            return 409, {
                "error": "PET_NOT_ADOPTED",
                "message": "请先在个人页领养刘看山",
                "profile": camel_profile(profile, user_id),
            }

        try:
            conn.execute("BEGIN")
            conn.execute(
                """
                INSERT INTO pet_content_event
                  (event_id, user_id, content_id, content_type, action_type,
                   completion_ratio, duration_sec, content_tags, reward_status,
                   exp_reward, satiety_reward, mood_reward, travel_energy_reward, occurred_at, created_at)
                VALUES
                  (?, ?, ?, ?, ?, ?, ?, ?, 'granted', ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    user_id,
                    content_id,
                    content_type,
                    action_type,
                    completion_ratio,
                    duration_sec,
                    tags_text,
                    reward["exp"],
                    reward["satiety"],
                    reward["mood"],
                    reward["travelEnergy"],
                    occurred_at,
                    now_text(),
                ),
            )
        except sqlite3.IntegrityError:
            existing = conn.execute(
                "SELECT * FROM pet_content_event WHERE event_id = ?",
                (event_id,),
            ).fetchone()
            conn.rollback()
            return 200, {
                "duplicate": True,
                "reward": {
                    "exp": existing["exp_reward"],
                    "satiety": existing["satiety_reward"],
                    "mood": existing["mood_reward"],
                    "travelEnergy": existing["travel_energy_reward"],
                    "levelUp": False,
                    "stageChanged": False,
                },
                "profile": camel_profile(fetch_profile(conn, user_id), user_id),
            }

        old = profile
        new_total_exp = old["total_exp"] + reward["exp"]
        new_satiety = min(100, old["satiety"] + reward["satiety"])
        new_mood = min(100, old["mood"] + reward["mood"])
        new_travel_energy = old["travel_energy"] + reward["travelEnergy"]
        level_row = fetch_level(conn, new_total_exp)
        new_level = level_row["level"] if level_row else old["level"]
        new_stage = level_row["stage"] if level_row else old["stage"]

        read_increment = 1 if action_type == "read" else 0
        watch_increment = 1 if action_type == "watch" else 0
        interaction_increment = 1 if action_type in ("like", "comment", "collect") else 0

        conn.execute(
            """
            UPDATE pet_profile
            SET total_exp = ?,
                satiety = ?,
                mood = ?,
                travel_energy = ?,
                level = ?,
                stage = ?,
                total_read_count = total_read_count + ?,
                total_watch_count = total_watch_count + ?,
                total_interaction_count = total_interaction_count + ?,
                last_growth_at = ?,
                updated_at = ?
            WHERE user_id = ?
            """,
            (
                new_total_exp,
                new_satiety,
                new_mood,
                new_travel_energy,
                new_level,
                new_stage,
                read_increment,
                watch_increment,
                interaction_increment,
                now_text(),
                now_text(),
                user_id,
            ),
        )

        increment_content_counter(conn, content_id, action_type)

        write_growth_log(conn, user_id, event_id, "total_exp", reward["exp"], old["total_exp"], new_total_exp, "内容消费获得经验")
        write_growth_log(conn, user_id, event_id, "satiety", reward["satiety"], old["satiety"], new_satiety, "内容消费提升饱食度")
        write_growth_log(conn, user_id, event_id, "mood", reward["mood"], old["mood"], new_mood, "互动提升心情")
        if new_level != old["level"]:
            write_growth_log(conn, user_id, event_id, "level", new_level - old["level"], old["level"], new_level, "累计经验触发升级")
        if new_stage != old["stage"]:
            write_growth_log(conn, user_id, event_id, "stage", 0, old["stage"], new_stage, "等级变化触发阶段切换")

        stat_date = occurred_at[:10]
        conn.execute(
            """
            INSERT INTO pet_daily_stat
              (user_id, stat_date, valid_read_count, valid_watch_count, valid_interaction_count,
               exp_gained, satiety_gained, mood_gained, travel_energy_gained, created_at, updated_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, stat_date) DO UPDATE SET
              valid_read_count = valid_read_count + excluded.valid_read_count,
              valid_watch_count = valid_watch_count + excluded.valid_watch_count,
              valid_interaction_count = valid_interaction_count + excluded.valid_interaction_count,
              exp_gained = exp_gained + excluded.exp_gained,
              satiety_gained = satiety_gained + excluded.satiety_gained,
              mood_gained = mood_gained + excluded.mood_gained,
              travel_energy_gained = travel_energy_gained + excluded.travel_energy_gained,
              updated_at = excluded.updated_at
            """,
            (
                user_id,
                stat_date,
                read_increment,
                watch_increment,
                interaction_increment,
                reward["exp"],
                reward["satiety"],
                reward["mood"],
                reward["travelEnergy"],
                now_text(),
                now_text(),
            ),
        )
        conn.commit()

        new_profile = fetch_profile(conn, user_id)
        updated_content = fetch_content(conn, content_id)
        return 200, {
            "reward": {
                **reward,
                "levelUp": new_level != old["level"],
                "fromLevel": old["level"],
                "toLevel": new_level,
                "stageChanged": new_stage != old["stage"],
                "fromStage": old["stage"],
                "toStage": new_stage,
            },
            "profile": camel_profile(new_profile, user_id),
            "content": camel_content(updated_content) if updated_content else None,
        }


def fetch_theme_config(conn, theme):
    return conn.execute(
        "SELECT * FROM pet_travel_theme_config WHERE theme = ?",
        (theme,),
    ).fetchone()


def theme_meta(theme):
    return TRAVEL_THEME_MESSAGES.get(theme) or TRAVEL_THEME_MESSAGES["arctic"]


def camel_travel_content(row):
    if row is None:
        return None
    content = camel_content(row)
    return {
        **content,
        "rank": row["rank"],
        "matchReason": row["match_reason"],
        "claimed": bool(row["claimed"]),
        "reward": {
            "exp": row["reward_exp"],
            "mood": row["reward_mood"],
            "travelEnergy": row["reward_energy"],
        },
    }


def fetch_travel_contents(conn, travel_id):
    return [
        camel_travel_content(row)
        for row in conn.execute(
            """
            SELECT c.*, rc.rank, rc.match_reason, rc.claimed,
                   rc.reward_exp, rc.reward_mood, rc.reward_energy
            FROM pet_travel_return_content rc
            JOIN zhihu_content_pool c ON c.content_id = rc.content_id
            WHERE rc.travel_id = ?
            ORDER BY rc.rank ASC, rc.id ASC
            """,
            (travel_id,),
        ).fetchall()
    ]


def camel_travel(row, conn=None, include_contents=False):
    if row is None:
        return None
    payload = {
        "travelId": row["travel_id"],
        "userId": row["user_id"],
        "theme": row["theme"],
        "themeTitle": theme_meta(row["theme"])["title"],
        "status": row["status"],
        "energyCost": row["energy_cost"],
        "startedAt": row["started_at"],
        "expectedReturnAt": row["expected_return_at"],
        "returnedAt": row["returned_at"],
        "claimedAt": row["claimed_at"],
        "message": row["message"],
    }
    if include_contents and conn is not None:
        payload["contents"] = fetch_travel_contents(conn, row["travel_id"])
    return payload


def camel_handbook(row, conn=None, include_contents=False):
    if row is None:
        return None
    payload = {
        "travelId": row["travel_id"],
        "userId": row["user_id"],
        "themeTitle": row["theme_title"],
        "routeText": row["route_text"],
        "petQuote": row["pet_quote"],
        "coverStyle": row["cover_style"],
        "createdAt": row["created_at"],
    }
    if include_contents and conn is not None:
        payload["contents"] = fetch_travel_contents(conn, row["travel_id"])
    return payload


def fetch_travel(conn, travel_id):
    return conn.execute(
        "SELECT * FROM pet_travel_event WHERE travel_id = ?",
        (travel_id,),
    ).fetchone()


def fetch_current_travel(conn, user_id):
    profile = fetch_profile(conn, user_id)
    if profile and profile["current_travel_id"]:
        row = fetch_travel(conn, profile["current_travel_id"])
        if row is not None:
            return row
    return conn.execute(
        """
        SELECT *
        FROM pet_travel_event
        WHERE user_id = ? AND status IN ('traveling', 'returned')
        ORDER BY started_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()


def refresh_travel_status(conn, user_id):
    profile = fetch_profile(conn, user_id)
    if profile is None:
        return None, None

    changed = False
    if profile["travel_status"] == "cooldown" and parse_time(profile["cooldown_until"]) <= datetime.now():
        conn.execute(
            """
            UPDATE pet_profile
            SET travel_status = 'home',
                cooldown_until = NULL,
                updated_at = ?
            WHERE user_id = ?
            """,
            (now_text(), user_id),
        )
        changed = True

    travel = fetch_current_travel(conn, user_id)
    if travel and travel["status"] == "traveling" and parse_time(travel["expected_return_at"]) <= datetime.now():
        conn.execute(
            """
            UPDATE pet_travel_event
            SET status = 'returned',
                returned_at = ?,
                message = ?,
                updated_at = ?
            WHERE travel_id = ?
            """,
            (now_text(), theme_meta(travel["theme"])["return"], now_text(), travel["travel_id"]),
        )
        conn.execute(
            """
            UPDATE pet_profile
            SET travel_status = 'returned',
                current_travel_id = ?,
                updated_at = ?
            WHERE user_id = ?
            """,
            (travel["travel_id"], now_text(), user_id),
        )
        changed = True
        travel = fetch_travel(conn, travel["travel_id"])

    if changed:
        profile = fetch_profile(conn, user_id)
    return profile, travel


def travel_block_reason(profile, active_travel):
    if profile is None or not profile["adopted"]:
        return "请先领养刘看山"
    if active_travel and active_travel["status"] == "traveling":
        return "刘看山正在游历中"
    if active_travel and active_travel["status"] == "returned":
        return "刘看山已经归来，先领取带回的内容"
    if profile["travel_status"] == "cooldown" and parse_time(profile["cooldown_until"]) > datetime.now():
        return "刘看山刚旅行回来，正在休息冷却"
    if profile["level"] < 2:
        return "Lv.2 后可以出门游历"
    if profile["satiety"] < TRAVEL_MIN_SATIETY:
        return f"饱食度达到 {TRAVEL_MIN_SATIETY} 后可以出门"
    if profile["travel_energy"] < TRAVEL_DEFAULT_ENERGY_COST:
        return f"游历精力达到 {TRAVEL_DEFAULT_ENERGY_COST} 后可以出门"
    return None


def recent_user_tags(conn, user_id, limit=20):
    tags = []
    rows = conn.execute(
        """
        SELECT content_tags
        FROM pet_content_event
        WHERE user_id = ? AND content_tags IS NOT NULL
        ORDER BY occurred_at DESC, id DESC
        LIMIT ?
        """,
        (user_id, limit),
    ).fetchall()
    for row in rows:
        tags.extend(parse_json_array(row["content_tags"]))
    return tags


def choose_travel_theme(conn, user_id, requested):
    if requested in TRAVEL_THEME_MESSAGES:
        return requested
    user_tags = recent_user_tags(conn, user_id)
    best_theme = "arctic"
    best_score = -1
    for row in conn.execute("SELECT * FROM pet_travel_theme_config").fetchall():
        preferred = set(parse_json_array(row["preferred_tags"]))
        score = sum(1 for tag in user_tags if tag in preferred)
        if score > best_score:
            best_score = score
            best_theme = row["theme"]
    return best_theme


def select_travel_contents(conn, user_id, theme, limit):
    theme_row = fetch_theme_config(conn, theme)
    preferred = set(parse_json_array(theme_row["preferred_tags"] if theme_row else "[]"))
    consumed = {
        row["content_id"]
        for row in conn.execute(
            """
            SELECT DISTINCT content_id
            FROM pet_content_event
            WHERE user_id = ?
            ORDER BY occurred_at DESC
            LIMIT 50
            """,
            (user_id,),
        ).fetchall()
    }
    rows = conn.execute(
        """
        SELECT *
        FROM zhihu_content_pool
        WHERE status = 'published'
        ORDER BY hot_score DESC, published_at DESC, id DESC
        """
    ).fetchall()
    scored = []
    fallback = []
    for row in rows:
        tags = set(parse_json_array(row["tags"]))
        score = len(tags & preferred)
        target = scored if score > 0 and row["content_id"] not in consumed else fallback
        target.append((score, row))
    ranked = [row for _, row in sorted(scored, key=lambda item: item[0], reverse=True)]
    if len(ranked) < limit:
        ranked.extend(row for _, row in fallback if row["content_id"] not in {item["content_id"] for item in ranked})
    return ranked[:limit]


def travel_status_payload(conn, user_id):
    profile, travel = refresh_travel_status(conn, user_id)
    reason = travel_block_reason(profile, travel)
    handbook_count = conn.execute(
        "SELECT COUNT(*) FROM pet_travel_handbook WHERE user_id = ?",
        (user_id,),
    ).fetchone()[0]
    return {
        "profile": camel_profile(profile, user_id),
        "activeTravel": camel_travel(travel, conn, include_contents=travel is not None and travel["status"] in ("returned", "claimed")),
        "canTravel": reason is None,
        "blockReason": reason,
        "handbookCount": handbook_count,
    }


def start_travel(user_id, requested_theme="auto"):
    with connect_db() as conn:
        conn.execute("BEGIN")
        profile, active_travel = refresh_travel_status(conn, user_id)
        reason = travel_block_reason(profile, active_travel)
        if reason:
            conn.rollback()
            return 409, {
                "error": "TRAVEL_NOT_READY",
                "message": reason,
                **travel_status_payload(conn, user_id),
            }

        theme = choose_travel_theme(conn, user_id, requested_theme)
        theme_row = fetch_theme_config(conn, theme)
        meta = theme_meta(theme)
        energy_cost = theme_row["energy_cost"] if theme_row else TRAVEL_DEFAULT_ENERGY_COST
        duration_sec = theme_row["duration_sec"] if theme_row else 60
        return_count = 2 if profile["level"] >= 5 else (theme_row["return_count"] if theme_row else 1)
        contents = select_travel_contents(conn, user_id, theme, return_count)
        if not contents:
            conn.rollback()
            return 409, {
                "error": "TRAVEL_CONTENT_EMPTY",
                "message": "内容池里暂时没有可带回的内容",
                **travel_status_payload(conn, user_id),
            }

        travel_id = f"travel_{user_id}_{int(datetime.now().timestamp() * 1000)}"
        started_at = now_text()
        expected_return_at = future_text(seconds=duration_sec)
        conn.execute(
            """
            INSERT INTO pet_travel_event
              (travel_id, user_id, theme, status, energy_cost, started_at,
               expected_return_at, message, created_at, updated_at)
            VALUES
              (?, ?, ?, 'traveling', ?, ?, ?, ?, ?, ?)
            """,
            (travel_id, user_id, theme, energy_cost, started_at, expected_return_at, meta["start"], now_text(), now_text()),
        )
        for index, content in enumerate(contents, start=1):
            conn.execute(
                """
                INSERT INTO pet_travel_return_content
                  (travel_id, content_id, rank, match_reason,
                   reward_exp, reward_mood, reward_energy, created_at, updated_at)
                VALUES
                  (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    travel_id,
                    content["content_id"],
                    index,
                    f"{meta['title']}带回：命中内容兴趣标签",
                    TRAVEL_CLAIM_EXP,
                    TRAVEL_CLAIM_MOOD,
                    TRAVEL_CLAIM_ENERGY,
                    now_text(),
                    now_text(),
                ),
            )
        conn.execute(
            """
            INSERT INTO pet_travel_handbook
              (travel_id, user_id, theme_title, route_text, pet_quote, cover_style, created_at, updated_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (travel_id, user_id, meta["title"], meta["route"], meta["quote"], meta["cover"], now_text(), now_text()),
        )
        conn.execute(
            """
            UPDATE pet_profile
            SET travel_energy = travel_energy - ?,
                travel_status = 'traveling',
                current_travel_id = ?,
                cooldown_until = NULL,
                last_travel_at = ?,
                updated_at = ?
            WHERE user_id = ?
            """,
            (energy_cost, travel_id, started_at, now_text(), user_id),
        )
        conn.commit()
        travel = fetch_travel(conn, travel_id)
        return 200, {
            "travel": camel_travel(travel, conn, include_contents=False),
            "profile": camel_profile(fetch_profile(conn, user_id), user_id),
            "message": meta["start"],
        }


def return_travel(user_id, force=True):
    with connect_db() as conn:
        conn.execute("BEGIN")
        profile, travel = refresh_travel_status(conn, user_id)
        if travel is None or travel["status"] not in ("traveling", "returned"):
            conn.rollback()
            return 409, {"error": "NO_ACTIVE_TRAVEL", "message": "当前没有进行中的游历"}
        if travel["status"] == "traveling":
            if not force and parse_time(travel["expected_return_at"]) > datetime.now():
                conn.rollback()
                return 409, {"error": "TRAVEL_NOT_FINISHED", "message": "刘看山还在路上"}
            meta = theme_meta(travel["theme"])
            conn.execute(
                """
                UPDATE pet_travel_event
                SET status = 'returned',
                    returned_at = ?,
                    message = ?,
                    updated_at = ?
                WHERE travel_id = ?
                """,
                (now_text(), meta["return"], now_text(), travel["travel_id"]),
            )
            conn.execute(
                """
                UPDATE pet_profile
                SET travel_status = 'returned',
                    current_travel_id = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (travel["travel_id"], now_text(), user_id),
            )
        conn.commit()
        travel = fetch_current_travel(conn, user_id)
        return 200, {
            "travel": camel_travel(travel, conn, include_contents=True),
            "profile": camel_profile(fetch_profile(conn, user_id), user_id),
        }


def claim_travel(user_id, travel_id=None):
    with connect_db() as conn:
        conn.execute("BEGIN")
        profile, travel = refresh_travel_status(conn, user_id)
        if travel_id:
            travel = fetch_travel(conn, travel_id)
        if travel is None or travel["user_id"] != user_id:
            conn.rollback()
            return 404, {"error": "TRAVEL_NOT_FOUND"}
        if travel["status"] == "traveling":
            conn.rollback()
            return 409, {"error": "TRAVEL_NOT_RETURNED", "message": "刘看山还没回来"}
        if travel["status"] == "claimed":
            conn.rollback()
            return 200, {
                "duplicate": True,
                "travel": camel_travel(travel, conn, include_contents=True),
                "profile": camel_profile(profile, user_id),
            }
        if travel["status"] != "returned":
            conn.rollback()
            return 409, {"error": "TRAVEL_CANNOT_CLAIM", "message": "当前游历不能领取"}

        rewards = conn.execute(
            """
            SELECT
              COALESCE(SUM(reward_exp), 0) AS exp,
              COALESCE(SUM(reward_mood), 0) AS mood,
              COALESCE(SUM(reward_energy), 0) AS travel_energy
            FROM pet_travel_return_content
            WHERE travel_id = ? AND claimed = 0
            """,
            (travel["travel_id"],),
        ).fetchone()
        old = profile
        exp_reward = int(rewards["exp"] or 0)
        mood_reward = int(rewards["mood"] or 0)
        energy_reward = int(rewards["travel_energy"] or 0)
        new_total_exp = old["total_exp"] + exp_reward
        new_mood = min(100, old["mood"] + mood_reward)
        new_travel_energy = old["travel_energy"] + energy_reward
        level_row = fetch_level(conn, new_total_exp)
        new_level = level_row["level"] if level_row else old["level"]
        new_stage = level_row["stage"] if level_row else old["stage"]
        cooldown_until = future_text(minutes=TRAVEL_COOLDOWN_MINUTES)

        conn.execute(
            """
            UPDATE pet_travel_return_content
            SET claimed = 1,
                updated_at = ?
            WHERE travel_id = ?
            """,
            (now_text(), travel["travel_id"]),
        )
        conn.execute(
            """
            UPDATE pet_travel_event
            SET status = 'claimed',
                claimed_at = ?,
                updated_at = ?
            WHERE travel_id = ?
            """,
            (now_text(), now_text(), travel["travel_id"]),
        )
        conn.execute(
            """
            UPDATE pet_profile
            SET total_exp = ?,
                mood = ?,
                travel_energy = ?,
                level = ?,
                stage = ?,
                travel_status = 'cooldown',
                current_travel_id = NULL,
                cooldown_until = ?,
                last_growth_at = ?,
                updated_at = ?
            WHERE user_id = ?
            """,
            (
                new_total_exp,
                new_mood,
                new_travel_energy,
                new_level,
                new_stage,
                cooldown_until,
                now_text(),
                now_text(),
                user_id,
            ),
        )
        source_id = travel["travel_id"]
        write_growth_log(conn, user_id, source_id, "total_exp", exp_reward, old["total_exp"], new_total_exp, "领取游历带回内容获得经验", "manual")
        write_growth_log(conn, user_id, source_id, "mood", mood_reward, old["mood"], new_mood, "领取游历带回内容提升心情", "manual")
        if new_level != old["level"]:
            write_growth_log(conn, user_id, source_id, "level", new_level - old["level"], old["level"], new_level, "游历奖励触发升级", "manual")
        if new_stage != old["stage"]:
            write_growth_log(conn, user_id, source_id, "stage", 0, old["stage"], new_stage, "等级变化触发阶段切换", "manual")
        conn.commit()

        claimed_travel = fetch_travel(conn, travel["travel_id"])
        return 200, {
            "travel": camel_travel(claimed_travel, conn, include_contents=True),
            "profile": camel_profile(fetch_profile(conn, user_id), user_id),
            "reward": {
                "exp": exp_reward,
                "satiety": 0,
                "mood": mood_reward,
                "travelEnergy": energy_reward,
                "levelUp": new_level != old["level"],
                "fromLevel": old["level"],
                "toLevel": new_level,
                "stageChanged": new_stage != old["stage"],
                "fromStage": old["stage"],
                "toStage": new_stage,
            },
            "cooldownUntil": cooldown_until,
        }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[p0-mock] {self.address_string()} - {fmt % args}")

    def send_redirect(self, location, cookie=None):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def send_json(self, status, body, extra_headers=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, path):
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        file_size = path.stat().st_size
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix == ".glb":
            mime = "model/gltf-binary"

        range_header = self.headers.get("Range")
        start = 0
        end = file_size - 1
        status = 200
        if range_header and range_header.startswith("bytes="):
            raw_range = range_header.removeprefix("bytes=").split(",", 1)[0]
            raw_start, _, raw_end = raw_range.partition("-")
            try:
                if raw_start:
                    start = int(raw_start)
                if raw_end:
                    end = int(raw_end)
                end = min(end, file_size - 1)
                if start > end or start < 0:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{file_size}")
                    self.end_headers()
                    return
                status = 206
            except ValueError:
                start = 0
                end = file_size - 1

        content_length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", cache_control_for(path))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.end_headers()
        try:
            with path.open("rb") as file:
                file.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk = file.read(min(1024 * 256, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            return

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def get_cookie_value(self, name):
        raw_cookie = self.headers.get("Cookie")
        if not raw_cookie:
            return None
        cookie = SimpleCookie()
        cookie.load(raw_cookie)
        morsel = cookie.get(name)
        return morsel.value if morsel else None

    def is_local_request(self):
        host = (self.headers.get("Host") or "").split(":", 1)[0].lower()
        return host in ("127.0.0.1", "localhost", "::1")

    def local_bypass_session(self):
        if not LOCAL_AUTH_BYPASS or not self.is_local_request():
            return None
        with connect_db() as conn:
            user = upsert_zhihu_user(conn, mock_zhihu_user())
        return {"user_id": int(user["uid"])}

    def get_current_session(self):
        session_id = self.get_cookie_value(SESSION_COOKIE_NAME)
        with connect_db() as conn:
            session = fetch_session(conn, session_id)
        if session is not None:
            return session
        return self.local_bypass_session()

    def require_auth_json(self):
        session = self.get_current_session()
        if session is None:
            self.send_json(401, {"error": "AUTH_REQUIRED", "loginUrl": "/auth/login"})
            return None
        return session

    def require_auth_page(self, next_url):
        session = self.get_current_session()
        if session is None:
            self.send_redirect(f"/auth/login?next={quote(safe_next_url(next_url))}")
            return None
        return session

    def session_cookie(self, session_id):
        max_age = SESSION_TTL_HOURS * 3600
        return f"{SESSION_COOKIE_NAME}={session_id}; Max-Age={max_age}; HttpOnly; SameSite=Lax; Path=/"

    def clear_session_cookie(self):
        return f"{SESSION_COOKIE_NAME}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/"

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/static/"):
            self.send_file(STATIC_DIR / unquote(path.removeprefix("/static/")))
            return
        if path.startswith("/3d-liukanshan-roaming/"):
            self.send_file(ROAMING_DIR / unquote(path.removeprefix("/3d-liukanshan-roaming/")))
            return

        if path == "/auth/login":
            qs = parse_qs(parsed.query)
            next_url = safe_next_url((qs.get("next") or ["/"])[0])
            if AUTH_MODE == "mock" and self.is_local_request():
                with connect_db() as conn:
                    user = upsert_zhihu_user(conn, mock_zhihu_user())
                    session_id = create_session(conn, user["uid"])
                self.send_redirect(next_url, self.session_cookie(session_id))
                return

            if not ZH_APP_ID or not ZH_APP_KEY:
                self.send_error(500, "Missing ZH_APP_ID or ZH_APP_KEY")
                return
            with connect_db() as conn:
                state = create_oauth_state(conn, next_url)
            params = urlencode({
                "redirect_uri": ZH_AUTH_REDIRECT_URI,
                "app_id": ZH_APP_ID,
                "response_type": "code",
                "state": state,
            })
            self.send_redirect(f"{ZH_OPENAPI_BASE}/authorize?{params}")
            return

        if path == "/auth/callback":
            qs = parse_qs(parsed.query)
            code = (qs.get("code") or qs.get("authorization_code") or [""])[0]
            state = (qs.get("state") or [""])[0]
            if not code:
                self.send_error(400, "Missing OAuth code")
                return
            with connect_db() as conn:
                next_url = "/"
                if state:
                    state_row = consume_oauth_state(conn, state)
                    if state_row is None:
                        self.send_error(400, "Invalid OAuth state")
                        return
                    next_url = safe_next_url(state_row["next_url"])
            try:
                token = exchange_access_token(code)
                zhihu_user = fetch_zhihu_user(token["access_token"])
            except Exception as error:
                self.send_error(502, f"Zhihu OAuth failed: {error}")
                return
            with connect_db() as conn:
                user = upsert_zhihu_user(conn, zhihu_user)
                save_oauth_token(conn, user["uid"], token)
                session_id = create_session(conn, user["uid"])
            self.send_redirect(next_url, self.session_cookie(session_id))
            return

        if path == "/api/auth/me":
            session = self.get_current_session()
            if session is None:
                self.send_json(200, {"authenticated": False, "loginUrl": "/auth/login"})
                return
            with connect_db() as conn:
                user = fetch_user(conn, session["user_id"])
            self.send_json(200, {"authenticated": True, "user": camel_user(user)})
            return

        if path in ("/", "/people/p2wcex"):
            session = self.require_auth_page(self.path)
            if session is None:
                return
            self.send_file(STATIC_DIR / "index.html")
            return

        if path == "/api/p0/pet/profile":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            with connect_db() as conn:
                self.send_json(200, {"profile": camel_profile(fetch_profile(conn, user_id), user_id)})
            return
        if path == "/api/p0/pet/daily-stat":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            user_id = session["user_id"]
            stat_date = (qs.get("date") or [datetime.now().date().isoformat()])[0]
            with connect_db() as conn:
                row = conn.execute(
                    "SELECT * FROM pet_daily_stat WHERE user_id = ? AND stat_date = ?",
                    (user_id, stat_date),
                ).fetchone()
                self.send_json(200, {"dailyStat": row_to_dict(row)})
            return

        if path == "/api/p0/contents":
            qs = parse_qs(parsed.query)
            limit = int((qs.get("limit") or [20])[0])
            limit = max(1, min(limit, 100))
            with connect_db() as conn:
                contents = [camel_content(row) for row in fetch_contents(conn, limit)]
                self.send_json(200, {"contents": contents})
            return

        if path == "/api/p0/follow-moments":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            limit = max(1, min(int((qs.get("limit") or [20])[0]), 50))
            with connect_db() as conn:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM zhihu_follow_moment
                    WHERE user_id = ?
                    ORDER BY action_time DESC, id DESC
                    LIMIT ?
                    """,
                    (session["user_id"], limit),
                ).fetchall()
                self.send_json(200, {"moments": [camel_follow_moment(row) for row in rows]})
            return

        if path == "/api/p1/travel/status":
            session = self.require_auth_json()
            if session is None:
                return
            with connect_db() as conn:
                self.send_json(200, travel_status_payload(conn, session["user_id"]))
            return

        if path == "/api/p1/travel/handbook":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            limit = max(1, min(int((qs.get("limit") or [20])[0]), 50))
            with connect_db() as conn:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM pet_travel_handbook
                    WHERE user_id = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (session["user_id"], limit),
                ).fetchall()
                self.send_json(200, {"handbook": [camel_handbook(row, conn, include_contents=True) for row in rows]})
            return

        if path.startswith("/api/p1/travel/handbook/"):
            session = self.require_auth_json()
            if session is None:
                return
            travel_id = unquote(path.removeprefix("/api/p1/travel/handbook/"))
            with connect_db() as conn:
                row = conn.execute(
                    """
                    SELECT *
                    FROM pet_travel_handbook
                    WHERE user_id = ? AND travel_id = ?
                    """,
                    (session["user_id"], travel_id),
                ).fetchone()
                if row is None:
                    self.send_json(404, {"error": "HANDBOOK_NOT_FOUND"})
                else:
                    self.send_json(200, {"entry": camel_handbook(row, conn, include_contents=True)})
            return

        if path.startswith("/api/p0/contents/"):
            content_id = unquote(path.removeprefix("/api/p0/contents/"))
            with connect_db() as conn:
                content = camel_content(fetch_content(conn, content_id), include_full=True)
                if content is None:
                    self.send_json(404, {"error": "CONTENT_NOT_FOUND"})
                else:
                    self.send_json(200, {"content": content})
            return

        self.send_error(404)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/", "/people/p2wcex"):
            session = self.require_auth_page(self.path)
            if session is None:
                return
            target = STATIC_DIR / "index.html"
        elif path.startswith("/static/"):
            target = STATIC_DIR / unquote(path.removeprefix("/static/"))
        elif path.startswith("/3d-liukanshan-roaming/"):
            target = ROAMING_DIR / unquote(path.removeprefix("/3d-liukanshan-roaming/"))
        else:
            self.send_error(404)
            return

        if not target.exists() or not target.is_file():
            self.send_error(404)
            return

        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix == ".glb":
            mime = "model/gltf-binary"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(target.stat().st_size))
        self.send_header("Cache-Control", cache_control_for(target))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            body = self.read_body()
        except json.JSONDecodeError:
            self.send_json(400, {"error": "BAD_JSON"})
            return

        if path == "/auth/logout":
            session_id = self.get_cookie_value(SESSION_COOKIE_NAME)
            if session_id:
                with connect_db() as conn:
                    conn.execute("DELETE FROM auth_session WHERE session_id = ?", (session_id,))
            self.send_json(200, {"ok": True}, {"Set-Cookie": self.clear_session_cookie()})
            return

        if path == "/api/p0/pet/adopt":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            pet_name = str(body.get("petName") or "刘看山")
            with connect_db() as conn:
                conn.execute(
                    """
                    INSERT INTO pet_profile
                      (user_id, adopted, pet_name, created_at, updated_at)
                    VALUES
                      (?, 1, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                      adopted = 1,
                      pet_name = excluded.pet_name,
                      updated_at = excluded.updated_at
                    """,
                    (user_id, pet_name, now_text(), now_text()),
                )
                self.send_json(200, {"profile": camel_profile(fetch_profile(conn, user_id), user_id)})
            return

        if path == "/api/p0/pet/reset":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            with connect_db() as conn:
                travel_ids = [row["travel_id"] for row in conn.execute("SELECT travel_id FROM pet_travel_event WHERE user_id = ?", (user_id,)).fetchall()]
                if travel_ids:
                    placeholders = ",".join("?" for _ in travel_ids)
                    conn.execute(f"DELETE FROM pet_travel_return_content WHERE travel_id IN ({placeholders})", travel_ids)
                    conn.execute(f"DELETE FROM pet_travel_handbook WHERE travel_id IN ({placeholders})", travel_ids)
                conn.execute("DELETE FROM pet_travel_event WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM pet_growth_log WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM pet_content_event WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM pet_daily_stat WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM pet_profile WHERE user_id = ?", (user_id,))
                self.send_json(200, {"profile": camel_profile(fetch_profile(conn, user_id), user_id)})
            return

        if path == "/api/p0/pet/content-events":
            session = self.require_auth_json()
            if session is None:
                return
            status, response = apply_content_event(body, session["user_id"])
            self.send_json(status, response)
            return

        if path == "/api/p0/follow-moments/sync":
            session = self.require_auth_json()
            if session is None:
                return
            page = int(body.get("page") or 0)
            per_page = int(body.get("perPage") or body.get("per_page") or 10)
            status, response = sync_follow_moments(session["user_id"], page=page, per_page=per_page)
            self.send_json(status, response)
            return

        if path == "/api/p0/follow-moments/mark-notified":
            session = self.require_auth_json()
            if session is None:
                return
            status, response = mark_follow_moments_notified(session["user_id"])
            self.send_json(status, response)
            return

        if path == "/api/p1/travel/start":
            session = self.require_auth_json()
            if session is None:
                return
            status, response = start_travel(session["user_id"], str(body.get("theme") or "auto"))
            self.send_json(status, response)
            return

        if path == "/api/p1/travel/return":
            session = self.require_auth_json()
            if session is None:
                return
            status, response = return_travel(session["user_id"], force=bool(body.get("force", True)))
            self.send_json(status, response)
            return

        if path == "/api/p1/travel/claim":
            session = self.require_auth_json()
            if session is None:
                return
            status, response = claim_travel(session["user_id"], body.get("travelId"))
            self.send_json(status, response)
            return

        self.send_error(404)


if __name__ == "__main__":
    init_db()
    host = os.environ.get("HOST") or "127.0.0.1"
    port = int(os.environ.get("PORT") or 5173)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"P0 mock server running at http://{host}:{port}")
    print(f"推荐页: http://{host}:{port}/")
    print(f"个人页: http://{host}:{port}/people/p2wcex")
    server.serve_forever()
