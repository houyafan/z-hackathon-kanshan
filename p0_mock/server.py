#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, unquote, urlparse
from urllib.request import Request, urlopen
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("DB_PATH") or ROOT / "db" / "sqlite" / "liukanshan_p0.sqlite")
INIT_SQL = ROOT / "db" / "sqlite" / "init_p0.sql"
STATIC_DIR = ROOT / "p0_mock" / "static"
ROAMING_DIR = ROOT / "3d-liukanshan-roaming"
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH") or ROOT / "p0_mock" / "config.json")
BUNDLED_CONFIG_PATH = ROOT / "p0_mock" / "config.json"
LEVEL_VISUAL_CONFIG_PATH = ROOT / "p0_mock" / "level_visuals.json"
DEFAULT_USER_ID = 10001
SESSION_COOKIE_NAME = "lks_session"
APP_TZ = timezone(timedelta(hours=8), "Asia/Shanghai")
ADMIN_USER_TOKENS = {"p2wcex", "sunny-27-1-97"}
ADMIN_USER_UIDS = {1908940156829918831, 2013197829758268031}


def now_dt():
    """Return app wall-clock time in Beijing as a naive datetime.

    The existing persistence/comparison code stores naive ISO strings. Keeping
    this naive avoids breaking comparisons while making the app independent of
    the host/container timezone.
    """
    return datetime.now(APP_TZ).replace(tzinfo=None)


def env_bool(name):
    value = os.environ.get(name)
    if value is None:
        return None
    return value.strip().lower() in ("1", "true", "yes", "on")


def apply_env_overrides(config):
    string_overrides = {
        "auth_mode": "AUTH_MODE",
        "zhihu_openapi_base": "ZH_OPENAPI_BASE",
        "zhihu_hot_list_api_url": "ZH_HOT_LIST_API_URL",
        "zhihu_hot_list_access_secret": "ZH_HOT_LIST_ACCESS_SECRET",
        "zhihu_access_secret": "ZH_ACCESS_SECRET",
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
        "zhihu_hot_list_api_url": "https://developer.zhihu.com/api/v1/content/hot_list",
        "zhihu_hot_list_access_secret": "",
        "zhihu_access_secret": "",
        "zhihu_app_id": "",
        "zhihu_app_key": "",
        "zhihu_auth_redirect_uri": "http://127.0.0.1:5173/auth/callback",
        "community_base_url": "https://openapi.zhihu.com",
        "community_app_key": "",
        "community_app_secret": "",
        "community_ring_id": "",
        "community_fallback_ring_ids": ["2001009660925334090", "2015023739549529606"],
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

    def read_json_config(path):
        if not path.exists():
            return {}
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    bundled_config = read_json_config(BUNDLED_CONFIG_PATH)
    external_config = {}
    if CONFIG_PATH != BUNDLED_CONFIG_PATH:
        external_config = read_json_config(CONFIG_PATH)

    merged = {**default_config, **bundled_config, **external_config}
    merged["mock_user"] = {
        **default_config["mock_user"],
        **bundled_config.get("mock_user", {}),
        **external_config.get("mock_user", {}),
    }
    for key in ("zhihu_app_id", "zhihu_app_key", "zhihu_auth_redirect_uri"):
        if not merged.get(key) and bundled_config.get(key):
            merged[key] = bundled_config[key]
    return apply_env_overrides(merged)


CONFIG = load_config()
ZH_OPENAPI_BASE = CONFIG["zhihu_openapi_base"].rstrip("/")
ZH_HOT_LIST_API_URL = str(
    os.environ.get("ZH_DATA_PLATFORM_HOT_URL")
    or CONFIG.get("zhihu_hot_list_api_url")
    or "https://developer.zhihu.com/api/v1/content/hot_list"
)
ZH_HOT_LIST_ACCESS_SECRET = str(
    os.environ.get("ZH_HOT_LIST_ACCESS_SECRET")
    or os.environ.get("ZH_DATA_PLATFORM_ACCESS_SECRET")
    or os.environ.get("ZH_DEVELOPER_ACCESS_SECRET")
    or os.environ.get("ZH_DATA_PLATFORM_TOKEN")
    or CONFIG.get("zhihu_hot_list_access_secret")
    or CONFIG.get("zhihu_access_secret")
    or os.environ.get("ZH_ACCESS_SECRET")
    or ""
)
ZH_APP_ID = str(CONFIG.get("zhihu_app_id") or "")
ZH_APP_KEY = str(CONFIG.get("zhihu_app_key") or "")
ZH_AUTH_REDIRECT_URI = str(CONFIG.get("zhihu_auth_redirect_uri") or "http://127.0.0.1:5173/auth/callback")
AUTH_MODE = str(CONFIG.get("auth_mode") or ("oauth" if ZH_APP_ID and ZH_APP_KEY else "mock")).lower()
MOCK_USER = CONFIG["mock_user"]
COMMUNITY_BASE_URL = str(CONFIG.get("community_base_url") or ZH_OPENAPI_BASE).rstrip("/")
COMMUNITY_APP_KEY = str(CONFIG.get("community_app_key") or "")
COMMUNITY_APP_SECRET = str(CONFIG.get("community_app_secret") or "")
COMMUNITY_RING_ID = str(CONFIG.get("community_ring_id") or "")
COMMUNITY_FALLBACK_RING_IDS = [
    str(item)
    for item in (CONFIG.get("community_fallback_ring_ids") or [])
    if str(item).strip()
]
SESSION_TTL_HOURS = int(CONFIG.get("session_ttl_hours") or 24)
STATE_TTL_MINUTES = int(CONFIG.get("state_ttl_minutes") or 10)
LOCAL_AUTH_BYPASS = bool(CONFIG.get("local_auth_bypass"))
FOLLOW_MOMENT_EXP = 2
FOLLOW_MOMENT_MAX_EXP_PER_SYNC = 10
FOLLOW_MOMENT_MOOD = 1
FOLLOW_MOMENT_MAX_MOOD_PER_SYNC = 5
# 不互动衰减：超过阈值后每小时按速率扣，直到下限。DECAY_SPEEDUP 用于 demo 加速。
DECAY_THRESHOLD_HOURS = 24
DECAY_SATIETY_PER_HOUR = 3
DECAY_MOOD_PER_HOUR = 2
DECAY_MAX_HOURS = 24 * 60  # 60 days catchup ceiling
DECAY_SPEEDUP = float(os.environ.get("DECAY_SPEEDUP") or 1.0)
TRAVEL_SPEEDUP = float(os.environ.get("TRAVEL_SPEEDUP") or 1.0)
# 健康衰减：超过 7 天不互动后每天 -5。
DECAY_HEALTH_THRESHOLD_HOURS = 168
DECAY_HEALTH_PER_DAY = 5
# 休眠触发与唤醒
SLEEP_SATIETY_THRESHOLD = 20
SLEEP_HEALTH_THRESHOLD = 30
WAKE_REQUIRED_READS = 3
TRAVEL_MIN_SATIETY = 60
DECAY_ACTIVE_ACTIONS = ("read", "watch", "like", "comment", "collect")
TRAVEL_DEFAULT_ENERGY_COST = 10
TRAVEL_COOLDOWN_MINUTES = 10
TRAVEL_CLAIM_EXP = 8
TRAVEL_CLAIM_MOOD = 5
TRAVEL_CLAIM_ENERGY = 1
LEADERBOARD_SHARE_TRAVEL_ENERGY = TRAVEL_DEFAULT_ENERGY_COST

DAILY_SIGNIN_SATIETY = 5
DAILY_SIGNIN_MOOD = 3
DAILY_SIGNIN_ENERGY = 3
DAILY_QUEST_3READS_EXP = 10
DAILY_QUEST_3READS_ENERGY = 5
DAILY_QUEST_REQUIRED_READS = 3

PAT_MOOD_GAIN = 1
PAT_COOLDOWN_SECONDS = 60
PAT_DAILY_LIMIT = 30
TRAVEL_THEME_MESSAGES = {
    "polar": {
        "title": "极地旅行",
        "start": "看山去翻翻你关注的那群人最近都在分享什么，回来给你做一份小汇报。",
        "return": "看山从关注列表里逛了一圈回来啦，已经把今天的看点整理好了。",
        "route": "关注列表 -> 朋友们的最近动态 -> 看山的笔记本",
        "quote": "我把关注的人在聊什么记下来了，待会儿一起翻。",
        "cover": "polar",
    },
    "hotspot": {
        "title": "热点旅行",
        "start": "看山去知乎热榜现场看看大家在讨论什么，回来给你讲讲。",
        "return": "看山从热榜现场回来啦，已经记下了今天值得关注的几条。",
        "route": "热榜首页 -> 高讨论度话题 -> 看山的笔记本",
        "quote": "现场很热，我帮你把值得点开的几条挑出来了。",
        "cover": "hotspot",
    },
}
LEGACY_TRAVEL_THEME_MAP = {"arctic": "polar", "mountain": "hotspot"}
LLM_CONFIG = CONFIG.get("llm") or {}
LLM_API_URL = str(os.environ.get("LLM_API_URL") or LLM_CONFIG.get("api_url") or "https://ark.cn-beijing.volces.com/api/v3/chat/completions")
LLM_API_KEY = str(
    os.environ.get("VOLC_API_KEY")
    or os.environ.get("ARK_API_KEY")
    or os.environ.get("LLM_API_KEY")
    or LLM_CONFIG.get("api_key")
    or ""
)
LLM_MODEL = str(os.environ.get("LLM_MODEL") or LLM_CONFIG.get("model") or "ep-20260318222506-4qlr2")
LLM_TIMEOUT_SEC = int(os.environ.get("LLM_TIMEOUT_SEC") or LLM_CONFIG.get("timeout_sec") or 8)

LLM_DEMO_FALLBACK = bool(
    env_bool("LLM_DEMO_FALLBACK")
    if env_bool("LLM_DEMO_FALLBACK") is not None
    else LLM_CONFIG.get("demo_fallback", False)
)

# Lazy import: pet_llm.py is in the same package directory.
import sys as _sys
_sys.path.insert(0, str(Path(__file__).parent))
from pet_llm import PetLLM as _PetLLM, LLMError as _PetLLMError  # noqa: E402

PET_LLM = _PetLLM(
    api_url=LLM_API_URL,
    api_key=LLM_API_KEY,
    model=LLM_MODEL,
    prompts_dir=Path(__file__).parent / "prompts",
    timeout_sec=LLM_TIMEOUT_SEC,
    demo_fallback=LLM_DEMO_FALLBACK,
)


class LLMError(Exception):
    pass


# llm_chat_json migrated to PetLLM.chat_json (see pet_llm.py / Task 7).


def now_text():
    return now_dt().isoformat(timespec="seconds")


def future_text(**kwargs):
    return (now_dt() + timedelta(**kwargs)).isoformat(timespec="seconds")


def parse_time(value):
    if not value:
        return datetime.min
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            return parsed.astimezone(APP_TZ).replace(tzinfo=None)
        return parsed
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
    if path.suffix in (".js", ".css"):
        return "no-store"
    if path.suffix in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"):
        return "public, max-age=86400"
    return "no-store"


def connect_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
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


def seed_decay_config(conn):
    rules = [
        ("8h", 8, -3, -2, "今天还没一起看点内容呢"),
        ("24h", 24, -8, -6, "看山的学识值有点低啦"),
        ("48h", 48, -15, -12, "看山想和你一起补充新知识"),
    ]
    for decay_window, inactive_hours, satiety_delta, mood_delta, message in rules:
        conn.execute(
            """
            INSERT INTO pet_decay_config
              (decay_window, inactive_hours, satiety_delta, mood_delta, message, enabled, created_at, updated_at)
            VALUES
              (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(decay_window) DO UPDATE SET
              inactive_hours = excluded.inactive_hours,
              satiety_delta = excluded.satiety_delta,
              mood_delta = excluded.mood_delta,
              message = excluded.message,
              enabled = 1,
              updated_at = excluded.updated_at
            """,
            (decay_window, inactive_hours, satiety_delta, mood_delta, message, now_text(), now_text()),
        )


DEFAULT_LEVEL_VISUALS = [
    {
        "level": 1,
        "stage": "cub",
        "title": "新手探索员",
        "effect_style": "cute",
        "description": "基础红围巾，刚开始陪主人探索知识宇宙",
    },
    {
        "level": 2,
        "stage": "cub",
        "title": "星章探索员",
        "effect_style": "cute",
        "description": "围巾星章点亮，开始积累阅读成就",
    },
    {
        "level": 3,
        "stage": "cub",
        "title": "任务新星",
        "effect_style": "cute",
        "description": "挂上任务星章，进入稳定阅读节奏",
    },
    {
        "level": 4,
        "stage": "growing",
        "title": "行星记录员",
        "effect_style": "explore",
        "description": "戴上航天帽和行星徽章，开始记录知识旅程",
    },
    {
        "level": 5,
        "stage": "growing",
        "title": "火箭见习官",
        "effect_style": "explore",
        "description": "背上迷你科考包，准备更远的内容探索",
    },
    {
        "level": 6,
        "stage": "growing",
        "title": "星图导航员",
        "effect_style": "explore",
        "description": "护目镜与指南针就位，能看懂更复杂的知识路线",
    },
    {
        "level": 7,
        "stage": "adult",
        "title": "深空任务官",
        "effect_style": "cool",
        "description": "带着任务旗帜出发，拥有稳定的深度阅读能力",
    },
    {
        "level": 8,
        "stage": "adult",
        "title": "知识探测者",
        "effect_style": "cool",
        "description": "点亮探测头灯和知识权杖，能发现隐藏的优质内容",
    },
    {
        "level": 9,
        "stage": "adult",
        "title": "星际领航员",
        "effect_style": "cool",
        "description": "蓝金徽章与能量装备成型，进入高阶陪伴状态",
    },
    {
        "level": 10,
        "stage": "advanced",
        "title": "宇宙知识领航员",
        "effect_style": "legendary",
        "description": "金色星际冠、披风与权杖加身，成为知识宇宙的领航伙伴",
    },
]


def load_level_visual_config():
    if not LEVEL_VISUAL_CONFIG_PATH.exists():
        return DEFAULT_LEVEL_VISUALS
    try:
        data = json.loads(LEVEL_VISUAL_CONFIG_PATH.read_text(encoding="utf-8"))
        levels = data.get("levels") if isinstance(data, dict) else data
        if not isinstance(levels, list):
            return DEFAULT_LEVEL_VISUALS
        by_level = {
            int(item.get("level")): item
            for item in levels
            if isinstance(item, dict) and str(item.get("level") or "").isdigit()
        }
        normalized = []
        for fallback in DEFAULT_LEVEL_VISUALS:
            item = by_level.get(int(fallback["level"]))
            if item is None:
                normalized.append(fallback)
                continue
            normalized.append({
                **fallback,
                **item,
                "level": int(item.get("level") or fallback["level"]),
            })
        return normalized or DEFAULT_LEVEL_VISUALS
    except Exception as error:
        print(f"[liukanshan-demo] level visual config load failed: {error}", flush=True)
        return DEFAULT_LEVEL_VISUALS


LEVEL_VISUALS = load_level_visual_config()
LEVEL_REQUIRED_TOTAL_EXP = {
    1: 0,
    2: 50,
    3: 120,
    4: 250,
    5: 450,
    6: 700,
    7: 1000,
    8: 1400,
    9: 1900,
    10: 2500,
}


def default_level_visual(level):
    try:
        safe_level = max(1, int(level))
    except (TypeError, ValueError):
        safe_level = 1
    capped_level = min(safe_level, 10)
    config = next((item for item in LEVEL_VISUALS if item["level"] == capped_level), LEVEL_VISUALS[0])
    return {
        **config,
        "level": safe_level,
        "image_url": f"/static/assets/pet-level/level-{capped_level:02d}.png",
        "thumbnail_url": f"/static/assets/pet-level/level-{capped_level:02d}.png",
        "share_bg_url": f"/static/assets/pet-level/{config['effect_style']}-share-bg.svg",
    }


def seed_level_visual_config(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pet_level_visual_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level INTEGER NOT NULL CHECK (level >= 1),
          stage TEXT NOT NULL CHECK (stage IN ('cub', 'growing', 'adult', 'advanced')),
          title TEXT NOT NULL,
          effect_style TEXT NOT NULL
            CHECK (effect_style IN ('cute', 'explore', 'cool', 'legendary')),
          image_url TEXT NOT NULL,
          thumbnail_url TEXT DEFAULT NULL,
          share_bg_url TEXT NOT NULL,
          description TEXT DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(level)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pet_level_visual_style "
        "ON pet_level_visual_config(effect_style, level)"
    )
    for item in LEVEL_VISUALS:
        visual = default_level_visual(item["level"])
        conn.execute(
            """
            INSERT INTO pet_level_visual_config
              (level, stage, title, effect_style, image_url, thumbnail_url, share_bg_url, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(level) DO UPDATE SET
              stage = excluded.stage,
              title = excluded.title,
              effect_style = excluded.effect_style,
              image_url = excluded.image_url,
              thumbnail_url = excluded.thumbnail_url,
              share_bg_url = excluded.share_bg_url,
              description = excluded.description,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                item["level"],
                item["stage"],
                item["title"],
                item["effect_style"],
                visual["image_url"],
                visual["thumbnail_url"],
                visual["share_bg_url"],
                item["description"],
            ),
        )


def seed_level_config(conn):
    for item in LEVEL_VISUALS:
        level = int(item["level"])
        conn.execute(
            """
            INSERT INTO pet_level_config
              (level, stage, required_total_exp, title, unlock_features)
            VALUES (?, ?, ?, ?, '[]')
            ON CONFLICT(level) DO UPDATE SET
              stage = excluded.stage,
              title = excluded.title,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                level,
                item["stage"],
                int(item.get("required_total_exp") or LEVEL_REQUIRED_TOTAL_EXP.get(level, 0)),
                item["title"],
            ),
        )
    conn.execute(
        """
        UPDATE pet_profile
        SET stage = (
              SELECT stage
              FROM pet_level_config
              WHERE pet_level_config.level = pet_profile.level
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE EXISTS (
          SELECT 1
          FROM pet_level_config
          WHERE pet_level_config.level = pet_profile.level
            AND pet_level_config.stage != pet_profile.stage
        )
        """
    )


def migrate_db(conn):
    add_column_if_missing(conn, "zhihu_user", "user_token", "TEXT DEFAULT NULL")
    mock_token = zhihu_user_token(MOCK_USER) or COMMUNITY_APP_KEY
    if mock_token:
        conn.execute(
            "UPDATE zhihu_user SET user_token = ? WHERE uid = ? AND (user_token IS NULL OR user_token = '')",
            (mock_token, DEFAULT_USER_ID),
        )
    add_column_if_missing(conn, "pet_profile", "health", "INTEGER NOT NULL DEFAULT 100 CHECK (health BETWEEN 0 AND 100)")
    add_column_if_missing(conn, "pet_profile", "travel_energy", "INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy >= 0)")
    add_column_if_missing(conn, "pet_profile", "travel_status", "TEXT NOT NULL DEFAULT 'home'")
    add_column_if_missing(conn, "pet_profile", "current_travel_id", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_profile", "cooldown_until", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_profile", "last_travel_at", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_content_event", "travel_energy_reward", "INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy_reward >= 0)")
    add_column_if_missing(conn, "pet_daily_stat", "travel_energy_gained", "INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy_gained >= 0)")
    migrate_travel_themes(conn)
    migrate_comment_assist_log(conn)
    migrate_follow_moment_overview(conn)
    migrate_follow_moment_retry_columns(conn)
    migrate_pet_profile_wake_columns(conn)
    migrate_pet_daily_stat_quest_columns(conn)
    migrate_pet_growth_log_check_constraints(conn)
    seed_level_config(conn)
    seed_level_visual_config(conn)
    add_column_if_missing(conn, "pet_travel_event", "reward_exp", f"INTEGER NOT NULL DEFAULT {TRAVEL_CLAIM_EXP} CHECK (reward_exp >= 0)")
    add_column_if_missing(conn, "pet_travel_event", "reward_mood", f"INTEGER NOT NULL DEFAULT {TRAVEL_CLAIM_MOOD} CHECK (reward_mood >= 0)")
    add_column_if_missing(conn, "pet_travel_event", "reward_energy", f"INTEGER NOT NULL DEFAULT {TRAVEL_CLAIM_ENERGY} CHECK (reward_energy >= 0)")
    add_column_if_missing(conn, "pet_travel_handbook", "llm_summary_status", "TEXT NOT NULL DEFAULT 'pending'")
    add_column_if_missing(conn, "pet_travel_handbook", "llm_summary", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_travel_handbook", "llm_pet_quote", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_travel_handbook", "llm_highlights", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_travel_handbook", "llm_summary_model", "TEXT DEFAULT NULL")
    add_column_if_missing(conn, "pet_travel_handbook", "llm_summary_updated_at", "TEXT DEFAULT NULL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pet_decay_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          decay_window TEXT NOT NULL,
          inactive_hours INTEGER NOT NULL CHECK (inactive_hours > 0),
          satiety_delta INTEGER NOT NULL CHECK (satiety_delta <= 0),
          mood_delta INTEGER NOT NULL CHECK (mood_delta <= 0),
          message TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (decay_window)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pet_state_decay_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          decay_window TEXT NOT NULL,
          inactive_since TEXT NOT NULL,
          checked_at TEXT NOT NULL,
          inactive_hours INTEGER NOT NULL CHECK (inactive_hours >= 0),
          satiety_delta INTEGER NOT NULL,
          mood_delta INTEGER NOT NULL,
          before_satiety INTEGER NOT NULL CHECK (before_satiety BETWEEN 0 AND 100),
          after_satiety INTEGER NOT NULL CHECK (after_satiety BETWEEN 0 AND 100),
          before_mood INTEGER NOT NULL CHECK (before_mood BETWEEN 0 AND 100),
          after_mood INTEGER NOT NULL CHECK (after_mood BETWEEN 0 AND 100),
          message TEXT DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, decay_window, inactive_since)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_pet_decay_config_enabled_hours
          ON pet_decay_config (enabled, inactive_hours)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_pet_state_decay_log_user_time
          ON pet_state_decay_log (user_id, created_at)
        """
    )
    seed_decay_config(conn)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pet_travel_external_content (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          travel_id TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('follow_moment', 'hot_list')),
          source_ref TEXT NOT NULL,
          rank INTEGER NOT NULL DEFAULT 1 CHECK (rank >= 1),
          title TEXT NOT NULL,
          excerpt TEXT DEFAULT NULL,
          author TEXT DEFAULT NULL,
          url TEXT DEFAULT NULL,
          thumbnail_url TEXT DEFAULT NULL,
          meta TEXT DEFAULT NULL CHECK (meta IS NULL OR json_valid(meta)),
          claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
          reward_exp INTEGER NOT NULL DEFAULT 8 CHECK (reward_exp >= 0),
          reward_mood INTEGER NOT NULL DEFAULT 5 CHECK (reward_mood >= 0),
          reward_energy INTEGER NOT NULL DEFAULT 1 CHECK (reward_energy >= 0),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (travel_id, source_ref)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_pet_travel_external_content_travel
          ON pet_travel_external_content (travel_id, rank)
        """
    )
    # Drop the legacy P0 table that's been fully replaced by pet_travel_external_content.
    conn.execute("DROP TABLE IF EXISTS pet_travel_return_content")


def migrate_travel_themes(conn):
    """Rename arctic→polar, mountain→hotspot. SQLite cannot ALTER CHECK, so rebuild
    pet_travel_theme_config / pet_travel_event when their CHECK still mentions 'arctic'.

    All DDL is wrapped in a single explicit transaction so that a crash mid-rebuild
    cannot leave the database in a half-renamed state. Avoids `executescript` because
    it issues an implicit COMMIT first, which would break this transaction guarantee.
    """

    def needs_rebuild(table_name):
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
            (table_name,),
        ).fetchone()
        return bool(row) and "'arctic'" in (row["sql"] or "")

    rebuild_theme_config = needs_rebuild("pet_travel_theme_config")
    rebuild_event = needs_rebuild("pet_travel_event")
    if not (rebuild_theme_config or rebuild_event):
        # No structural change needed — but still normalize legacy cover_style values.
        conn.execute(
            "UPDATE pet_travel_handbook SET cover_style = 'polar', updated_at = ? WHERE cover_style = 'arctic'",
            (now_text(),),
        )
        conn.execute(
            "UPDATE pet_travel_handbook SET cover_style = 'hotspot', updated_at = ? WHERE cover_style = 'mountain'",
            (now_text(),),
        )
        return

    conn.execute("BEGIN")
    try:
        if rebuild_theme_config:
            conn.execute(
                """
                CREATE TABLE pet_travel_theme_config__new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  theme TEXT NOT NULL CHECK (theme IN ('polar', 'hotspot')),
                  title TEXT NOT NULL,
                  required_level INTEGER NOT NULL DEFAULT 2 CHECK (required_level >= 1),
                  energy_cost INTEGER NOT NULL DEFAULT 10 CHECK (energy_cost >= 0),
                  duration_sec INTEGER NOT NULL DEFAULT 60 CHECK (duration_sec > 0),
                  preferred_tags TEXT NOT NULL CHECK (json_valid(preferred_tags)),
                  return_count INTEGER NOT NULL DEFAULT 1 CHECK (return_count >= 1),
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE (theme)
                )
                """
            )
            conn.execute(
                """
                INSERT INTO pet_travel_theme_config__new
                  (id, theme, title, required_level, energy_cost, duration_sec,
                   preferred_tags, return_count, created_at, updated_at)
                SELECT id,
                       CASE theme WHEN 'arctic' THEN 'polar'
                                  WHEN 'mountain' THEN 'hotspot'
                                  ELSE theme END,
                       title, required_level, energy_cost, duration_sec,
                       preferred_tags, return_count, created_at, updated_at
                FROM pet_travel_theme_config
                """
            )
            conn.execute("DROP TABLE pet_travel_theme_config")
            conn.execute("ALTER TABLE pet_travel_theme_config__new RENAME TO pet_travel_theme_config")
            conn.execute(
                """
                UPDATE pet_travel_theme_config
                SET title = '极地旅行',
                    preferred_tags = '["科技","科普","AI","学术","知识","冷知识","深度回答"]',
                    updated_at = ?
                WHERE theme = 'polar'
                """,
                (now_text(),),
            )
            conn.execute(
                """
                UPDATE pet_travel_theme_config
                SET title = '热点旅行',
                    preferred_tags = '["热点","社会观察","体育","影视","职场","生活","情感","高赞讨论"]',
                    updated_at = ?
                WHERE theme = 'hotspot'
                """,
                (now_text(),),
            )

        if rebuild_event:
            conn.execute(
                """
                CREATE TABLE pet_travel_event__new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  travel_id TEXT NOT NULL,
                  user_id INTEGER NOT NULL,
                  theme TEXT NOT NULL CHECK (theme IN ('polar', 'hotspot')),
                  status TEXT NOT NULL
                    CHECK (status IN ('traveling', 'returned', 'claimed', 'recalled', 'failed')),
                  energy_cost INTEGER NOT NULL DEFAULT 0 CHECK (energy_cost >= 0),
                  started_at TEXT NOT NULL,
                  expected_return_at TEXT NOT NULL,
                  returned_at TEXT DEFAULT NULL,
                  claimed_at TEXT DEFAULT NULL,
                  message TEXT DEFAULT NULL,
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE (travel_id)
                )
                """
            )
            conn.execute(
                """
                INSERT INTO pet_travel_event__new
                  (id, travel_id, user_id, theme, status, energy_cost, started_at,
                   expected_return_at, returned_at, claimed_at, message, created_at, updated_at)
                SELECT id, travel_id, user_id,
                       CASE theme WHEN 'arctic' THEN 'polar'
                                  WHEN 'mountain' THEN 'hotspot'
                                  ELSE theme END,
                       status, energy_cost, started_at, expected_return_at,
                       returned_at, claimed_at, message, created_at, updated_at
                FROM pet_travel_event
                """
            )
            conn.execute("DROP TABLE pet_travel_event")
            conn.execute("ALTER TABLE pet_travel_event__new RENAME TO pet_travel_event")
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_pet_travel_event_user_status
                  ON pet_travel_event (user_id, status, started_at DESC)
                """
            )

        conn.execute(
            "UPDATE pet_travel_handbook SET cover_style = 'polar', updated_at = ? WHERE cover_style = 'arctic'",
            (now_text(),),
        )
        conn.execute(
            "UPDATE pet_travel_handbook SET cover_style = 'hotspot', updated_at = ? WHERE cover_style = 'mountain'",
            (now_text(),),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def migrate_comment_assist_log(conn):
    """Idempotent: ensure pet_comment_assist_log table exists with current schema."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pet_comment_assist_log'"
    ).fetchone()
    if row:
        return
    conn.execute(
        """
        CREATE TABLE pet_comment_assist_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          content_id TEXT NOT NULL,
          content_type TEXT NOT NULL,
          prompt_payload TEXT NOT NULL,
          suggested_comment TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'streaming'
            CHECK (status IN ('streaming','ready','failed','used','discarded')),
          model TEXT DEFAULT NULL,
          final_comment TEXT DEFAULT NULL,
          used_as_is INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_comment_assist_user_content "
        "ON pet_comment_assist_log(user_id, content_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_comment_assist_user_streaming "
        "ON pet_comment_assist_log(user_id, content_id, status)"
    )


def migrate_follow_moment_overview(conn):
    """Idempotent: ensure pet_follow_moment_overview table exists."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pet_follow_moment_overview'"
    ).fetchone()
    if row:
        return
    conn.execute(
        """
        CREATE TABLE pet_follow_moment_overview (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          sync_batch_id TEXT NOT NULL,
          overview_text TEXT NOT NULL DEFAULT '',
          moment_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ready'
            CHECK (status IN ('ready','failed','skipped')),
          model TEXT DEFAULT NULL,
          consumed_at TEXT DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_follow_overview_user_unconsumed "
        "ON pet_follow_moment_overview(user_id, consumed_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_follow_overview_batch "
        "ON pet_follow_moment_overview(sync_batch_id)"
    )


def migrate_follow_moment_retry_columns(conn):
    """Idempotent: ALTER zhihu_follow_moment to add llm_retry_count + llm_error."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(zhihu_follow_moment)")}
    if "llm_retry_count" not in cols:
        conn.execute(
            "ALTER TABLE zhihu_follow_moment ADD COLUMN llm_retry_count INTEGER NOT NULL DEFAULT 0"
        )
    if "llm_error" not in cols:
        conn.execute(
            "ALTER TABLE zhihu_follow_moment ADD COLUMN llm_error TEXT DEFAULT NULL"
        )


def migrate_pet_profile_wake_columns(conn):
    """Idempotent: ALTER pet_profile to add wake_status / wake_progress /
    last_wake_message / wake_message_at columns. Required for the sleep+wake
    mechanic; safe to run on already-migrated DBs."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(pet_profile)")}
    if "wake_status" not in cols:
        conn.execute(
            "ALTER TABLE pet_profile ADD COLUMN wake_status TEXT NOT NULL DEFAULT 'awake'"
        )
    if "wake_progress" not in cols:
        conn.execute(
            "ALTER TABLE pet_profile ADD COLUMN wake_progress INTEGER NOT NULL DEFAULT 0"
        )
    if "last_wake_message" not in cols:
        conn.execute(
            "ALTER TABLE pet_profile ADD COLUMN last_wake_message TEXT DEFAULT NULL"
        )
    if "wake_message_at" not in cols:
        conn.execute(
            "ALTER TABLE pet_profile ADD COLUMN wake_message_at TEXT DEFAULT NULL"
        )


def migrate_pet_daily_stat_quest_columns(conn):
    """Idempotent: ALTER pet_daily_stat to add signed_in_at + quest_3reads_claimed."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(pet_daily_stat)")}
    if "signed_in_at" not in cols:
        conn.execute("ALTER TABLE pet_daily_stat ADD COLUMN signed_in_at TEXT DEFAULT NULL")
    if "quest_3reads_claimed" not in cols:
        conn.execute(
            "ALTER TABLE pet_daily_stat ADD COLUMN quest_3reads_claimed INTEGER NOT NULL DEFAULT 0"
        )


def migrate_pet_growth_log_check_constraints(conn):
    """Idempotent: rebuild pet_growth_log when the CHECK constraints still
    forbid 'travel_energy' (change_type) or 'pat' (source_type). Required
    for the 摸头 互动 + 每日签到 features that log into these new categories."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
        ("pet_growth_log",),
    ).fetchone()
    if not row:
        return
    sql_text = row["sql"] or ""
    if all(token in sql_text for token in ("'travel_energy'", "'pat'", "'health'", "'wake_status'")):
        return  # already up to date
    # Commit any pending implicit transaction so we can start a fresh one for
    # the rebuild. Python's sqlite3 module auto-begins on DML during prior
    # migrations, which would otherwise make BEGIN raise "transaction within
    # transaction". Rebuilding pet_growth_log must happen atomically.
    if conn.in_transaction:
        conn.commit()
    conn.execute("BEGIN")
    try:
        conn.execute(
            """
            CREATE TABLE pet_growth_log__new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              source_type TEXT NOT NULL CHECK (source_type IN ('content_event', 'daily_task', 'manual', 'decay', 'pat')),
              source_id TEXT NOT NULL,
              change_type TEXT NOT NULL CHECK (change_type IN ('total_exp', 'satiety', 'mood', 'level', 'stage', 'travel_energy', 'health', 'wake_status')),
              delta INTEGER NOT NULL,
              before_value INTEGER NOT NULL,
              after_value INTEGER NOT NULL,
              reason TEXT DEFAULT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            INSERT INTO pet_growth_log__new
              (id, user_id, source_type, source_id, change_type,
               delta, before_value, after_value, reason, created_at)
            SELECT id, user_id, source_type, source_id, change_type,
                   delta, before_value, after_value, reason, created_at
            FROM pet_growth_log
            """
        )
        conn.execute("DROP TABLE pet_growth_log")
        conn.execute("ALTER TABLE pet_growth_log__new RENAME TO pet_growth_log")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pet_growth_log_user_time "
            "ON pet_growth_log (user_id, created_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pet_growth_log_source "
            "ON pet_growth_log (source_type, source_id)"
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def row_to_dict(row):
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def camel_daily_stat(row):
    """Convert pet_daily_stat row to camelCase JSON for frontend consumption."""
    if row is None:
        return None
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "statDate": row["stat_date"],
        "validReadCount": row["valid_read_count"],
        "validWatchCount": row["valid_watch_count"],
        "validInteractionCount": row["valid_interaction_count"],
        "expGained": row["exp_gained"],
        "satietyGained": row["satiety_gained"],
        "moodGained": row["mood_gained"],
        "travelEnergyGained": row["travel_energy_gained"],
        "signedInAt": row["signed_in_at"] if "signed_in_at" in keys else None,
        "quest3readsClaimed": bool(row["quest_3reads_claimed"]) if "quest_3reads_claimed" in keys else False,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def camel_user(row):
    if row is None:
        return None
    return {
        "userId": row["uid"],
        "uid": row["uid"],
        "userToken": row["user_token"] if "user_token" in row.keys() else None,
        "isAdmin": is_admin_user(row),
        "fullname": row["fullname"],
        "gender": row["gender"],
        "headline": row["headline"],
        "description": row["description"],
        "avatarPath": row["avatar_path"],
        "phoneNo": row["phone_no"],
        "email": row["email"],
        "lastLoginAt": row["last_login_at"],
    }


def camel_level_visual(row, fallback_level=1):
    if row is None:
        row = default_level_visual(fallback_level)
    keys = set(row.keys()) if hasattr(row, "keys") else set(row)
    level = row["level"] if "level" in keys else fallback_level
    image_url = row["image_url"] if "image_url" in keys else default_level_visual(level)["image_url"]
    thumbnail_url = row["thumbnail_url"] if "thumbnail_url" in keys else None
    return {
        "level": level,
        "stage": row["stage"],
        "title": row["title"],
        "effectStyle": row["effect_style"],
        "imageUrl": image_url,
        "thumbnailUrl": thumbnail_url or image_url,
        "shareBgImage": row["share_bg_url"],
        "description": row["description"],
    }


def camel_profile(row, user_id=DEFAULT_USER_ID, level_visual=None):
    if row is None:
        return {
            "userId": user_id,
            "adopted": False,
        }
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    wake_status = row["wake_status"] if "wake_status" in keys else "awake"
    wake_progress = row["wake_progress"] if "wake_progress" in keys else 0
    last_wake_message = row["last_wake_message"] if "last_wake_message" in keys else None
    wake_message_at = row["wake_message_at"] if "wake_message_at" in keys else None
    visual = camel_level_visual(level_visual, row["level"])
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "adopted": bool(row["adopted"]),
        "petName": row["pet_name"],
        "level": row["level"],
        "stage": visual["stage"],
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
        "wakeStatus": wake_status or "awake",
        "wakeProgress": int(wake_progress or 0),
        "wakeRequired": WAKE_REQUIRED_READS,
        "lastWakeMessage": last_wake_message,
        "wakeMessageAt": wake_message_at,
        "level2dImage": visual["imageUrl"],
        "level2dThumbnail": visual["thumbnailUrl"],
        "levelTitle": visual["title"],
        "levelEffectStyle": visual["effectStyle"],
        "shareBgImage": visual["shareBgImage"],
        "levelVisualDescription": visual["description"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def camel_growth_log(row):
    if row is None:
        return None
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "sourceType": row["source_type"],
        "sourceId": row["source_id"],
        "changeType": row["change_type"],
        "delta": row["delta"],
        "beforeValue": row["before_value"],
        "afterValue": row["after_value"],
        "reason": row["reason"],
        "createdAt": row["created_at"],
    }


def parse_json_array(value):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def parse_json_dict(value):
    """Best-effort JSON-or-dict → dict. Used to read `meta` columns that are TEXT
    in DB rows but already-decoded dicts when passed through in-memory."""
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def normalize_theme(value, default="polar"):
    """Map a theme identifier (incl. legacy arctic/mountain) to the current
    canonical theme key (polar / hotspot)."""
    if value in TRAVEL_THEME_MESSAGES:
        return value
    mapped = LEGACY_TRAVEL_THEME_MAP.get(value)
    if mapped and mapped in TRAVEL_THEME_MESSAGES:
        return mapped
    return default


def camel_content(row, include_full=False, interactions=None):
    if row is None:
        return None
    interactions = interactions or {}
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
        "interactions": {
            "like": bool(interactions.get("like")),
            "comment": bool(interactions.get("comment")),
            "collect": bool(interactions.get("collect")),
        },
        "publishedAt": row["published_at"],
    }
    if include_full:
        content["fullContent"] = row["full_content"]
    return content


def fetch_level_visual(conn, level):
    try:
        safe_level = max(1, int(level))
    except (TypeError, ValueError):
        safe_level = 1
    row = conn.execute(
        "SELECT * FROM pet_level_visual_config WHERE level = ?",
        (safe_level,),
    ).fetchone()
    if row is None:
        row = conn.execute(
            """
            SELECT *
            FROM pet_level_visual_config
            WHERE level <= ?
            ORDER BY level DESC
            LIMIT 1
            """,
            (safe_level,),
        ).fetchone()
    return row or default_level_visual(safe_level)


def camel_leaderboard_item(row, rank, current_user_id, level_visual=None):
    visual = camel_level_visual(level_visual, row["level"])
    return {
        "rank": rank,
        "userId": row["user_id"],
        "fullname": row["fullname"] or f"知乎用户 {row['user_id']}",
        "avatarPath": row["avatar_path"] or "",
        "headline": row["headline"] or "",
        "description": row["description"] or "",
        "gender": row["gender"] or "",
        "petName": row["pet_name"] or "刘看山",
        "level": row["level"],
        "stage": row["stage"],
        "totalExp": row["total_exp"],
        "travelCount": row["travel_count"] or 0,
        "claimedTravelCount": row["claimed_travel_count"] or 0,
        "lastTravelAt": row["last_travel_at"] if "last_travel_at" in row.keys() else None,
        "level2dImage": visual["imageUrl"],
        "level2dThumbnail": visual["thumbnailUrl"],
        "levelTitle": visual["title"],
        "levelEffectStyle": visual["effectStyle"],
        "shareBgImage": visual["shareBgImage"],
        "levelVisualDescription": visual["description"],
        "isCurrentUser": int(row["user_id"]) == int(current_user_id),
    }


def leaderboard_payload(conn, current_user_id, rank_type, limit=50):
    limit = max(1, min(int(limit), 100))
    if rank_type == "travel_count":
        rows = conn.execute(
            """
            SELECT
              p.user_id,
              u.fullname,
              u.avatar_path,
              u.headline,
              u.description,
              u.gender,
              p.pet_name,
              p.level,
              p.stage,
              p.total_exp,
              COUNT(t.id) AS travel_count,
              SUM(CASE WHEN t.status = 'claimed' THEN 1 ELSE 0 END) AS claimed_travel_count,
              MAX(COALESCE(t.returned_at, t.claimed_at, t.started_at)) AS last_travel_at
            FROM pet_profile p
            JOIN pet_travel_event t ON t.user_id = p.user_id
            LEFT JOIN zhihu_user u ON u.uid = p.user_id
            WHERE p.adopted = 1
              AND t.status IN ('returned', 'claimed')
            GROUP BY p.user_id
            ORDER BY
              travel_count DESC,
              claimed_travel_count DESC,
              last_travel_at DESC,
              p.level DESC,
              p.user_id ASC
            """
        ).fetchall()
    else:
        rank_type = "pet_level"
        rows = conn.execute(
            """
            SELECT
              p.user_id,
              u.fullname,
              u.avatar_path,
              u.headline,
              u.description,
              u.gender,
              p.pet_name,
              p.level,
              p.stage,
              p.total_exp,
              COALESCE(t.travel_count, 0) AS travel_count,
              COALESCE(t.claimed_travel_count, 0) AS claimed_travel_count,
              t.last_travel_at AS last_travel_at
            FROM pet_profile p
            LEFT JOIN zhihu_user u ON u.uid = p.user_id
            LEFT JOIN (
              SELECT
                user_id,
                COUNT(*) AS travel_count,
                SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS claimed_travel_count,
                MAX(COALESCE(returned_at, claimed_at, started_at)) AS last_travel_at
              FROM pet_travel_event
              WHERE status IN ('returned', 'claimed')
              GROUP BY user_id
            ) t ON t.user_id = p.user_id
            WHERE p.adopted = 1
            ORDER BY p.level DESC, p.total_exp DESC, p.updated_at ASC, p.user_id ASC
            """
        ).fetchall()

    visual_cache = {}
    ranked_items = []
    for index, row in enumerate(rows):
        level = row["level"]
        if level not in visual_cache:
            visual_cache[level] = fetch_level_visual(conn, level)
        ranked_items.append(camel_leaderboard_item(row, index + 1, current_user_id, visual_cache[level]))
    current_item = next((item for item in ranked_items if item["isCurrentUser"]), None)
    return {
        "rankType": rank_type,
        "scope": "global",
        "limit": limit,
        "items": ranked_items[:limit],
        "currentUserRank": current_item["rank"] if current_item else None,
        "currentUserItem": current_item,
    }


def admin_overview_payload(conn):
    stats = {
        "users": conn.execute("SELECT COUNT(*) AS c FROM zhihu_user").fetchone()["c"],
        "adoptedPets": conn.execute("SELECT COUNT(*) AS c FROM pet_profile WHERE adopted = 1").fetchone()["c"],
        "contents": conn.execute("SELECT COUNT(*) AS c FROM zhihu_content_pool WHERE status = 'published'").fetchone()["c"],
        "growthEvents": conn.execute("SELECT COUNT(*) AS c FROM pet_growth_log").fetchone()["c"],
        "travels": conn.execute("SELECT COUNT(*) AS c FROM pet_travel_event").fetchone()["c"],
    }
    level_rows = conn.execute(
        """
        SELECT
          lc.level,
          lc.stage,
          lc.required_total_exp,
          COALESCE(lv.title, lc.title) AS title,
          COALESCE(lv.effect_style, 'cute') AS effect_style,
          COALESCE(lv.description, '') AS description
        FROM pet_level_config lc
        LEFT JOIN pet_level_visual_config lv ON lv.level = lc.level
        ORDER BY lc.level ASC
        """
    ).fetchall()
    levels = [
        {
            "level": row["level"],
            "stage": row["stage"],
            "requiredTotalExp": row["required_total_exp"],
            "title": row["title"],
            "effectStyle": row["effect_style"],
            "description": row["description"],
        }
        for row in level_rows
    ]
    return {"stats": stats, "levels": levels, "adminTokens": sorted(ADMIN_USER_TOKENS)}


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


def raw_follow_moment(row):
    if row is None:
        return None
    try:
        payload = json.loads(row["raw_payload"])
    except (TypeError, json.JSONDecodeError):
        payload = {
            "actor": {"name": row["actor_name"]},
            "action_text": row["action_text"],
            "action_time": row["action_time"],
            "target": {
                "title": row["target_title"],
                "excerpt": row["target_excerpt"],
                "author": {"name": row["target_author_name"]},
            },
        }
    # Frontend uses momentKey to match per-moment LLM summary into the card.
    if isinstance(payload, dict):
        payload.setdefault("momentKey", row["moment_key"])
    return payload


def fetch_user(conn, user_id):
    return conn.execute(
        "SELECT * FROM zhihu_user WHERE uid = ?",
        (user_id,),
    ).fetchone()


def zhihu_user_token(user):
    return str(
        user.get("user_token")
        or user.get("userToken")
        or user.get("url_token")
        or user.get("urlToken")
        or user.get("token")
        or ""
    ).strip()


def is_admin_user(user_row):
    if user_row is None:
        return False
    keys = user_row.keys() if hasattr(user_row, "keys") else []
    token = str(user_row["user_token"] if "user_token" in keys else "").strip()
    if token in ADMIN_USER_TOKENS:
        return True
    if "uid" in keys:
        try:
            if int(user_row["uid"]) in ADMIN_USER_UIDS:
                return True
        except (TypeError, ValueError):
            pass
    return False


def upsert_zhihu_user(conn, user):
    uid = int(user.get("uid") or user.get("userId"))
    user_token = zhihu_user_token(user) or None
    fullname = str(user.get("fullname") or "知乎用户")
    conn.execute(
        """
        INSERT INTO zhihu_user
          (uid, user_token, fullname, gender, headline, description, avatar_path, phone_no, email,
           last_login_at, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
          user_token = COALESCE(excluded.user_token, zhihu_user.user_token),
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
            user_token,
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
    if parse_time(row["expires_at"]) <= now_dt():
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
    if row is None or parse_time(row["expires_at"]) <= now_dt():
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
    if row is None or parse_time(row["expires_at"]) <= now_dt():
        return None
    return row


def fetch_zhihu_moments_payload(access_token, page=0, per_page=10):
    params = urlencode({"page": page, "per_page": per_page})
    request = Request(
        f"{ZH_OPENAPI_BASE}/user/moments?{params}",
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    with urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if isinstance(payload, dict) and payload.get("code") and payload.get("code") not in (0, 20000):
        raise RuntimeError(str(payload.get("data") or payload))
    return payload


def fetch_zhihu_moments(access_token, page=0, per_page=10):
    payload = fetch_zhihu_moments_payload(access_token, page=page, per_page=per_page)
    moments_payload = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), list) else payload
    if isinstance(moments_payload, list):
        return moments_payload
    return []


def append_query_param(url, key, value):
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    query[key] = [str(value)]
    return parsed._replace(query=urlencode(query, doseq=True)).geturl()


def community_configured():
    return bool(COMMUNITY_APP_KEY and COMMUNITY_APP_SECRET and COMMUNITY_RING_ID)


def community_headers():
    timestamp = str(int(time.time()))
    log_id = f"lks_{int(time.time() * 1000)}_{secrets.token_hex(4)}"
    extra_info = ""
    sign_str = f"app_key:{COMMUNITY_APP_KEY}|ts:{timestamp}|logid:{log_id}|extra_info:{extra_info}"
    digest = hmac.new(
        COMMUNITY_APP_SECRET.encode("utf-8"),
        sign_str.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return {
        "X-App-Key": COMMUNITY_APP_KEY,
        "X-Timestamp": timestamp,
        "X-Log-Id": log_id,
        "X-Sign": base64.b64encode(digest).decode("utf-8"),
        "X-Extra-Info": extra_info,
        "Accept": "application/json",
        "User-Agent": "z-hackathon-kanshan/1.0",
    }


def community_request(path, *, method="GET", params=None, body=None, timeout=10):
    if not community_configured():
        raise RuntimeError("COMMUNITY_CONFIG_MISSING")
    url = f"{COMMUNITY_BASE_URL}{path}"
    for key, value in (params or {}).items():
        if value is not None:
            url = append_query_param(url, key, value)
    data = None
    headers = community_headers()
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, method=method, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    code = payload.get("status", payload.get("code", 0)) if isinstance(payload, dict) else 0
    if code not in (0, "0", None, 20000, "20000"):
        raise RuntimeError(str(payload.get("msg") or payload.get("message") or payload))
    return payload


def normalize_community_comment(comment):
    if not isinstance(comment, dict):
        return None
    comment_id = str(comment.get("comment_id") or comment.get("commentId") or comment.get("id") or "")
    if not comment_id:
        return None
    return {
        "commentId": comment_id,
        "content": str(comment.get("content") or ""),
        "authorName": str(comment.get("author_name") or comment.get("authorName") or "知乎用户"),
        "authorToken": str(comment.get("author_token") or comment.get("authorToken") or ""),
        "likeCount": int(comment.get("like_count") or comment.get("likeCount") or 0),
        "replyCount": int(comment.get("reply_count") or comment.get("replyCount") or 0),
        "publishTime": int(comment.get("publish_time") or comment.get("publishTime") or 0),
    }


def normalize_community_pin(pin):
    if not isinstance(pin, dict):
        return None
    pin_id = str(pin.get("pin_id") or pin.get("content_token") or pin.get("id") or "")
    if not pin_id:
        return None
    return {
        "pinId": pin_id,
        "title": str(pin.get("title") or "").strip(),
        "content": str(pin.get("content") or "").strip(),
        "authorName": str(pin.get("author_name") or pin.get("authorName") or "知乎用户"),
        "authorToken": str(pin.get("author_token") or pin.get("authorToken") or ""),
        "images": pin.get("images") if isinstance(pin.get("images"), list) else [],
        "publishTime": int(pin.get("publish_time") or pin.get("publishTime") or 0),
        "likeNum": int(pin.get("like_num") or pin.get("likeNum") or 0),
        "commentNum": int(pin.get("comment_num") or pin.get("commentNum") or 0),
        "favNum": int(pin.get("fav_num") or pin.get("favNum") or 0),
        "shareNum": int(pin.get("share_num") or pin.get("shareNum") or 0),
        "comments": [item for item in (normalize_community_comment(comment) for comment in (pin.get("comments") or [])) if item],
    }


def fetch_community_ring_by_id(ring_id, page_num=1, page_size=20):
    page_num = max(1, int(page_num))
    page_size = max(1, min(int(page_size), 50))
    payload = community_request(
        "/openapi/ring/detail",
        params={"ring_id": ring_id, "page_num": page_num, "page_size": page_size},
    )
    data = payload.get("data") or {}
    ring = data.get("ring_info") or {}
    return {
        "source": "zhihu_community_api",
        "configured": True,
        "ring": {
            "ringId": str(ring.get("ring_id") or ring_id),
            "ringName": str(ring.get("ring_name") or "圈子"),
            "ringDesc": str(ring.get("ring_desc") or ""),
            "ringAvatar": str(ring.get("ring_avatar") or ""),
            "membershipNum": int(ring.get("membership_num") or 0),
            "discussionNum": int(ring.get("discussion_num") or 0),
        },
        "contents": [item for item in (normalize_community_pin(pin) for pin in (data.get("contents") or [])) if item],
        "pageNum": page_num,
        "pageSize": page_size,
    }


def fetch_community_ring(page_num=1, page_size=20):
    try:
        payload = fetch_community_ring_by_id(COMMUNITY_RING_ID, page_num, page_size)
        payload["requestedRingId"] = COMMUNITY_RING_ID
        payload["fallback"] = False
        return payload
    except Exception as error:
        last_error = error
        if "readable list" not in str(error):
            raise
        for fallback_ring_id in COMMUNITY_FALLBACK_RING_IDS:
            if fallback_ring_id == COMMUNITY_RING_ID:
                continue
            try:
                payload = fetch_community_ring_by_id(fallback_ring_id, page_num, page_size)
                payload["requestedRingId"] = COMMUNITY_RING_ID
                payload["fallback"] = True
                payload["fallbackReason"] = str(error)
                return payload
            except Exception as fallback_error:
                last_error = fallback_error
        raise last_error


def fetch_community_comments(content_token, content_type="pin", page_num=1, page_size=20):
    payload = community_request(
        "/openapi/comment/list",
        params={
            "content_token": content_token,
            "content_type": content_type,
            "page_num": max(1, int(page_num)),
            "page_size": max(1, min(int(page_size), 50)),
        },
    )
    data = payload.get("data") or {}
    return {
        "comments": [item for item in (normalize_community_comment(comment) for comment in (data.get("comments") or [])) if item],
        "hasMore": bool(data.get("has_more")),
    }


def send_community_reaction(content_token, content_type, action_value):
    return community_request(
        "/openapi/reaction",
        method="POST",
        body={
            "content_token": content_token,
            "content_type": content_type,
            "action_type": "like",
            "action_value": 1 if int(action_value) else 0,
        },
    )


def create_community_comment(content_token, content_type, content):
    return community_request(
        "/openapi/comment/create",
        method="POST",
        body={
            "content_token": content_token,
            "content_type": content_type,
            "content": content,
        },
    )


def publish_community_pin(title, content, image_urls=None):
    return community_request(
        "/openapi/publish/pin",
        method="POST",
        body={
            "title": title,
            "content": content,
            "image_urls": image_urls or [],
            "ring_id": COMMUNITY_RING_ID,
        },
    )


def url_origin(url):
    parsed = urlparse(str(url or ""))
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def project_public_origin(project_url=""):
    for candidate in (
        project_url,
        CONFIG.get("project_public_url"),
        ZH_AUTH_REDIRECT_URI,
        "https://ahipkiokdnvl.sealosbja.site/",
    ):
        origin = url_origin(candidate)
        if not origin:
            continue
        host = urlparse(origin).hostname or ""
        if host in ("127.0.0.1", "localhost", "0.0.0.0"):
            continue
        return origin
    return "https://ahipkiokdnvl.sealosbja.site"


def public_asset_url(asset_url, project_url=""):
    value = str(asset_url or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return value
    if value.startswith("//"):
        return f"https:{value}"
    origin = project_public_origin(project_url)
    return f"{origin}/{value.lstrip('/')}"


def leaderboard_share_image_urls(profile_payload, project_url=""):
    image_url = profile_payload.get("level2dImage") or profile_payload.get("level2dThumbnail")
    public_url = public_asset_url(image_url, project_url)
    return [public_url] if public_url else []


def leaderboard_share_copy(user, profile_payload, rank_item, project_url):
    level = profile_payload.get("level") or 1
    level_title = profile_payload.get("levelTitle") or "新手探索员"
    share_url = f"{project_public_origin(project_url)}/"
    title = "挖到一个超棒的知乎新玩法！「看山陪伴计划」"
    content = (
        f"体验地址：{share_url}\n\n"
        "把阅读变成养崽：\n"
        "✅ 每读一篇知乎内容，刘看山就会涨经验升级\n"
        "✅ 等级越高，解锁的造型和游历事件越多\n"
        "✅ 分享给好友，双方都能获得升级奖励\n\n"
        f"我的看山现在 Lv.{level}「{level_title}」，分享给你，一起来养专属阅读伙伴吧～"
    )
    return title, content


def leaderboard_share_today(conn, user_id):
    today = now_dt().date()
    start = datetime(today.year, today.month, today.day).isoformat(timespec="seconds")
    end = (datetime(today.year, today.month, today.day) + timedelta(days=1)).isoformat(timespec="seconds")
    return conn.execute(
        """
        SELECT created_at
        FROM pet_growth_log
        WHERE user_id = ?
          AND source_type = 'manual'
          AND source_id LIKE 'leaderboard-share-%'
          AND created_at >= ?
          AND created_at < ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id, start, end),
    ).fetchone()


def grant_leaderboard_share_reward(conn, user_id):
    profile = fetch_profile(conn, user_id)
    if profile is None or not profile["adopted"]:
        return 409, {"error": "PET_NOT_ADOPTED", "message": "请先领养刘看山"}
    old = profile
    max_level = max(item["level"] for item in LEVEL_VISUALS)
    target_level = min(int(old["level"]) + 1, max_level)
    target_row = conn.execute(
        "SELECT * FROM pet_level_config WHERE level = ?",
        (target_level,),
    ).fetchone()
    target_required_exp = int(target_row["required_total_exp"]) if target_row else int(old["total_exp"])
    new_total_exp = max(int(old["total_exp"]), target_required_exp)
    new_stage = target_row["stage"] if target_row else old["stage"]
    new_travel_energy = int(old["travel_energy"]) + LEADERBOARD_SHARE_TRAVEL_ENERGY
    share_id = f"leaderboard-share-{uuid.uuid4().hex[:12]}"
    clear_cooldown = old["travel_status"] == "cooldown"
    conn.execute(
        """
        UPDATE pet_profile
        SET total_exp = ?,
            level = ?,
            stage = ?,
            travel_energy = ?,
            travel_status = CASE WHEN ? THEN 'home' ELSE travel_status END,
            cooldown_until = CASE WHEN ? THEN NULL ELSE cooldown_until END,
            last_growth_at = ?,
            updated_at = ?
        WHERE user_id = ?
        """,
        (
            new_total_exp,
            target_level,
            new_stage,
            new_travel_energy,
            1 if clear_cooldown else 0,
            1 if clear_cooldown else 0,
            now_text(),
            now_text(),
            user_id,
        ),
    )
    exp_delta = new_total_exp - int(old["total_exp"])
    level_delta = target_level - int(old["level"])
    if exp_delta:
        write_growth_log(conn, user_id, share_id, "total_exp", exp_delta, old["total_exp"], new_total_exp, "排行榜发圈子升级奖励", "manual")
    write_growth_log(conn, user_id, share_id, "travel_energy", LEADERBOARD_SHARE_TRAVEL_ENERGY, old["travel_energy"], new_travel_energy, "排行榜发圈子获得一次游历资格", "manual")
    if level_delta:
        write_growth_log(conn, user_id, share_id, "level", level_delta, old["level"], target_level, "排行榜发圈子直接升级", "manual")
    if new_stage != old["stage"]:
        write_growth_log(conn, user_id, share_id, "stage", 0, old["stage"], new_stage, "等级变化触发阶段切换", "manual")
    return 200, {
        "reward": {
            "exp": exp_delta,
            "satiety": 0,
            "mood": 0,
            "travelEnergy": LEADERBOARD_SHARE_TRAVEL_ENERGY,
            "levelUp": bool(level_delta),
            "fromLevel": old["level"],
            "toLevel": target_level,
            "stageChanged": new_stage != old["stage"],
            "fromStage": old["stage"],
            "toStage": new_stage,
        },
        "profile": camel_profile(fetch_profile(conn, user_id), user_id),
        "shareId": share_id,
    }


def normalize_zhihu_web_url(url):
    if not url:
        return ""
    parsed = urlparse(str(url))
    # Reject javascript:/data:/vbscript: payloads that can ride in via third-party
    # follow_moment.raw_payload or hot-list responses.
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return ""
    if parsed.netloc == "api.zhihu.com" and parsed.path.startswith("/questions/"):
        question_id = parsed.path.rsplit("/", 1)[-1]
        return f"https://www.zhihu.com/question/{question_id}"
    return str(url)


def first_non_empty(*values):
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and value.strip() == "":
            continue
        return value
    return ""


def pick_hot_thumbnail(item):
    thumbnail = first_non_empty(
        item.get("ThumbnailUrl"),
        item.get("thumbnailUrl"),
        item.get("thumbnail_url"),
        item.get("thumbnail"),
        item.get("ImageUrl"),
        item.get("imageUrl"),
        item.get("image_url"),
        item.get("image"),
    )
    if thumbnail:
        return str(thumbnail)
    children = item.get("children") if isinstance(item.get("children"), list) else []
    for child in children:
        if not isinstance(child, dict):
            continue
        thumbnail = first_non_empty(child.get("thumbnail"), child.get("ThumbnailUrl"), child.get("thumbnailUrl"))
        if thumbnail:
            return str(thumbnail)
    return ""


def normalize_hot_payload(payload, limit):
    data = payload.get("Data") if isinstance(payload, dict) else None
    if data is None and isinstance(payload, dict):
        data = payload.get("data")
    if data is None:
        data = payload

    if isinstance(data, dict):
        raw_items = first_non_empty(data.get("Items"), data.get("items"), data.get("data"))
    else:
        raw_items = data
    if not isinstance(raw_items, list):
        raw_items = []

    items = []
    for index, raw in enumerate(raw_items[:limit], start=1):
        if not isinstance(raw, dict):
            continue
        target = raw.get("target") if isinstance(raw.get("target"), dict) else {}
        title = first_non_empty(raw.get("Title"), raw.get("title"), target.get("title"))
        if not title:
            continue
        url = first_non_empty(raw.get("Url"), raw.get("url"), raw.get("link"), target.get("url"))
        summary = first_non_empty(
            raw.get("Summary"),
            raw.get("summary"),
            raw.get("excerpt"),
            raw.get("Description"),
            raw.get("description"),
            target.get("excerpt"),
        )
        heat = first_non_empty(
            raw.get("DetailText"),
            raw.get("detailText"),
            raw.get("detail_text"),
            raw.get("hotText"),
            raw.get("hot_text"),
            raw.get("heat"),
        )
        if isinstance(heat, (int, float)):
            heat = f"{int(heat)} 热度"
        debut = bool(first_non_empty(raw.get("Debut"), raw.get("debut"), raw.get("isNew"), raw.get("is_new")))
        items.append({
            "rank": index,
            "title": str(title),
            "url": normalize_zhihu_web_url(url),
            "thumbnailUrl": pick_hot_thumbnail(raw),
            "summary": str(summary or ""),
            "heatText": str(heat or ""),
            "debut": debut,
            "contentType": str(first_non_empty(raw.get("Type"), raw.get("type"), target.get("type")) or ""),
        })
    return items


def fallback_hot_items(limit):
    items = [
        {
            "rank": 1,
            "title": "如何评价知乎热榜开放接口？",
            "url": "https://www.zhihu.com/hot",
            "thumbnailUrl": "https://pic1.zhimg.com/v2-d4b0f8158e064dbcc71eb6ce970230a9.jpg",
            "summary": "这是本地兜底数据。配置 Access Secret 后会切换为知乎开放平台热榜实时内容。",
            "heatText": "849 万热度",
            "debut": False,
            "contentType": "question",
        },
        {
            "rank": 2,
            "title": "开放平台 hot_list 接口如何返回标题、链接、缩略图和摘要？",
            "url": "https://developer.zhihu.com/docs?key=hot_list",
            "thumbnailUrl": "https://pic2.zhimg.com/v2-2b4d3f56dd3d87d006ff2827eb6d0a2d.jpg",
            "summary": "接口响应包含 Total 与 Items，单条内容包含 Title、Url、ThumbnailUrl、Summary 等字段。",
            "heatText": "612 万热度",
            "debut": True,
            "contentType": "article",
        },
        {
            "rank": 3,
            "title": "为什么热榜页面的排行、热度和分享按钮需要保持统一视觉？",
            "url": "https://www.zhihu.com/hot",
            "thumbnailUrl": "https://pic3.zhimg.com/v2-34b5a45f74d4a8b8c36f0fb42e60f5f2.jpg",
            "summary": "热榜是强扫描型页面，数字排行、标题层级、摘要与封面比例会直接影响阅读效率。",
            "heatText": "506 万热度",
            "debut": False,
            "contentType": "question",
        },
        {
            "rank": 4,
            "title": "当接口未配置 Access Secret 时，本地开发应该如何降级？",
            "url": "https://developer.zhihu.com/docs?key=hot_list",
            "thumbnailUrl": "",
            "summary": "开发环境可以使用同字段结构的兜底数据，避免 UI 验证被鉴权配置阻塞。",
            "heatText": "388 万热度",
            "debut": False,
            "contentType": "question",
        },
        {
            "rank": 5,
            "title": "知乎热榜列表为什么常用 190x105 的右侧封面？",
            "url": "https://www.zhihu.com/hot",
            "thumbnailUrl": "https://pic1.zhimg.com/v2-7ad7f6936b9a75e6bb7d94f20d06f9f5.jpg",
            "summary": "右侧缩略图在信息密度和视觉识别之间做了折中，能让用户快速判断热点类型。",
            "heatText": "297 万热度",
            "debut": False,
            "contentType": "question",
        },
        {
            "rank": 6,
            "title": "本地兜底数据：刘看山虚拟宠物每日学识榜单",
            "url": "https://www.zhihu.com/hot",
            "thumbnailUrl": "",
            "summary": "示例条目，用于本地无 access_secret 时凑齐 6 条素材，不会出现在线上热榜。",
            "heatText": "210 万热度",
            "debut": False,
            "contentType": "question",
        },
    ]
    return items[:limit]


def fetch_hot_items(limit=30):
    limit = max(1, min(int(limit), 30))
    if not ZH_HOT_LIST_ACCESS_SECRET:
        return {
            "source": "fallback",
            "configured": False,
            "total": min(limit, len(fallback_hot_items(limit))),
            "items": fallback_hot_items(limit),
        }

    api_url = ZH_HOT_LIST_API_URL.format(limit=limit, Limit=limit)
    if "{limit}" not in ZH_HOT_LIST_API_URL and "{Limit}" not in ZH_HOT_LIST_API_URL:
        api_url = append_query_param(api_url, "Limit", limit)
    request = Request(
        api_url,
        headers={
            "Authorization": f"Bearer {ZH_HOT_LIST_ACCESS_SECRET}",
            "X-Request-Timestamp": str(int(time.time())),
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "z-hackathon-kanshan/1.0",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if isinstance(payload, dict):
            code = payload.get("Code", payload.get("code", 0))
            if code not in (0, "0", None, 20000, "20000"):
                raise RuntimeError(str(payload.get("Message") or payload.get("message") or payload))
        items = normalize_hot_payload(payload, limit)
        return {
            "source": "zhihu_public_api",
            "configured": True,
            "total": len(items),
            "items": items,
        }
    except Exception as error:
        return {
            "source": "fallback",
            "configured": True,
            "error": str(error),
            "total": min(limit, len(fallback_hot_items(limit))),
            "items": fallback_hot_items(limit),
        }


def mock_zhihu_user():
    return {
        "uid": int(MOCK_USER.get("uid") or DEFAULT_USER_ID),
        "user_token": zhihu_user_token(MOCK_USER) or COMMUNITY_APP_KEY or "p2wcex",
        "fullname": MOCK_USER.get("fullname") or "看山七子",
        "gender": MOCK_USER.get("gender") or "unknown",
        "headline": MOCK_USER.get("headline") or "",
        "description": MOCK_USER.get("description") or "",
        "avatar_path": MOCK_USER.get("avatar_path") or "",
        "phone_no": MOCK_USER.get("phone_no") or "",
        "email": MOCK_USER.get("email") or "",
    }


def fetch_profile(conn, user_id):
    row = conn.execute(
        "SELECT * FROM pet_profile WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        return row
    row = apply_health_decay(conn, row)
    row = maybe_enter_sleep(conn, row)
    return row


def apply_health_decay(conn, profile):
    """长期不互动健康衰减。

    Satiety/mood 衰减由队友的 `apply_pet_decay`（PRD v1.4 钦定的 8/24/48h 阶梯版）
    单一负责；本函数只补健康值衰减——超过 DECAY_HEALTH_THRESHOLD_HOURS（默认 168h）
    后每天 -DECAY_HEALTH_PER_DAY，下限 0。

    幂等：每次调用按已扣的天数推进 `last_growth_at`，下次进来不会重扣同一窗口。
    """
    if profile is None or not profile["adopted"]:
        return profile
    last_at = profile["last_growth_at"]
    if not last_at:
        return profile
    try:
        last_dt = parse_time(last_at)
    except (TypeError, ValueError):
        return profile
    now = now_dt()
    elapsed_hours = (now - last_dt).total_seconds() / 3600.0
    if DECAY_SPEEDUP > 0:
        elapsed_hours *= DECAY_SPEEDUP
    if elapsed_hours < DECAY_HEALTH_THRESHOLD_HOURS:
        return profile
    health_extra_hours = min(
        elapsed_hours - DECAY_HEALTH_THRESHOLD_HOURS,
        DECAY_MAX_HOURS,
    )
    decay_days = int(health_extra_hours / 24)
    if decay_days <= 0:
        return profile
    health = int(profile["health"]) if profile["health"] is not None else 100
    health_dec = min(health, DECAY_HEALTH_PER_DAY * decay_days)
    if health_dec <= 0:
        return profile
    new_health = health - health_dec
    # Advance last_growth_at by the *decayed* days only, so future calls keep
    # the threshold offset and only re-decay the portion that hasn't been
    # accounted for yet. Convert decayed days → wall-clock seconds via
    # DECAY_SPEEDUP so demo acceleration stays consistent.
    advance_seconds = (decay_days * 24 * 3600.0) / max(DECAY_SPEEDUP, 1e-6)
    new_last_dt = last_dt + timedelta(seconds=advance_seconds)
    new_last = new_last_dt.isoformat(timespec="seconds")
    user_id = profile["user_id"]
    conn.execute(
        "UPDATE pet_profile SET health = ?, last_growth_at = ?, updated_at = ? "
        "WHERE user_id = ?",
        (new_health, new_last, now_text(), user_id),
    )
    write_growth_log(
        conn, user_id, "decay-health", "health",
        -health_dec, health, new_health,
        f"{decay_days}d 长期未互动健康衰减",
        source_type="decay",
    )
    updated = dict(profile)
    updated["health"] = new_health
    updated["last_growth_at"] = new_last
    return updated


def is_sleep_required(profile) -> bool:
    """Pet should be sleeping if satiety or health falls at or below threshold."""
    if profile is None:
        return False
    try:
        sat = int(profile["satiety"])
    except (TypeError, ValueError, KeyError):
        sat = 100
    health_value = profile["health"] if "health" in profile.keys() else 100
    try:
        health = int(health_value if health_value is not None else 100)
    except (TypeError, ValueError):
        health = 100
    return sat <= SLEEP_SATIETY_THRESHOLD or health <= SLEEP_HEALTH_THRESHOLD


def maybe_enter_sleep(conn, profile):
    """If pet should sleep but is currently awake, transition to sleeping
    and trigger LLM wake-message (sleep variant) generation."""
    if profile is None or not profile["adopted"]:
        return profile
    try:
        wake_status = profile["wake_status"]
    except (IndexError, KeyError):
        wake_status = "awake"
    if wake_status == "sleeping":
        return profile
    if not is_sleep_required(profile):
        return profile
    user_id = profile["user_id"]
    conn.execute(
        "UPDATE pet_profile SET wake_status='sleeping', wake_progress=0, updated_at=? "
        "WHERE user_id=?",
        (now_text(), user_id),
    )
    # write_growth_log skips delta==0 rows, but state-machine transitions
    # legitimately have no numeric delta — log via direct INSERT.
    conn.execute(
        "INSERT INTO pet_growth_log "
        "(user_id, source_type, source_id, change_type, delta, before_value, after_value, reason, created_at) "
        "VALUES (?, 'decay', 'decay-sleep', 'wake_status', 0, 0, 0, '饱食度/健康过低进入休眠', ?)",
        (user_id, now_text()),
    )
    schedule_wake_message(user_id, "sleep")
    updated = dict(profile)
    updated["wake_status"] = "sleeping"
    updated["wake_progress"] = 0
    return updated


def maybe_progress_wake(conn, profile, action_type):
    """When pet is sleeping and user does a content read/watch, bump wake_progress.
    On reaching threshold, fully wake up (restore stats, trigger LLM wake message).
    Only `read` and `watch` count — like/comment/collect do NOT contribute.
    Returns the (possibly updated) profile dict-like row."""
    if profile is None:
        return profile
    try:
        wake_status = profile["wake_status"]
    except (IndexError, KeyError):
        wake_status = "awake"
    if wake_status != "sleeping":
        return profile
    if action_type not in ("read", "watch"):
        return profile
    try:
        progress = int(profile["wake_progress"])
    except (TypeError, ValueError, IndexError, KeyError):
        progress = 0
    new_progress = progress + 1
    user_id = profile["user_id"]
    if new_progress < WAKE_REQUIRED_READS:
        conn.execute(
            "UPDATE pet_profile SET wake_progress=?, updated_at=? WHERE user_id=?",
            (new_progress, now_text(), user_id),
        )
        updated = dict(profile)
        updated["wake_progress"] = new_progress
        return updated
    # Wake up: restore minimum baseline.
    new_sat = max(int(profile["satiety"]), 50)
    new_mood = max(int(profile["mood"]), 50)
    cur_health = int(profile["health"] if profile["health"] is not None else 0)
    new_health = max(cur_health, 60)
    conn.execute(
        "UPDATE pet_profile SET wake_status='awake', wake_progress=0, "
        "satiety=?, mood=?, health=?, last_growth_at=?, updated_at=? WHERE user_id=?",
        (new_sat, new_mood, new_health, now_text(), now_text(), user_id),
    )
    conn.execute(
        "INSERT INTO pet_growth_log "
        "(user_id, source_type, source_id, change_type, delta, before_value, after_value, reason, created_at) "
        "VALUES (?, 'content_event', 'wake-up', 'wake_status', 0, 0, 0, ?, ?)",
        (user_id, f"消费 {WAKE_REQUIRED_READS} 条内容唤醒", now_text()),
    )
    schedule_wake_message(user_id, "wake")
    updated = dict(profile)
    updated["wake_status"] = "awake"
    updated["wake_progress"] = 0
    updated["satiety"] = new_sat
    updated["mood"] = new_mood
    updated["health"] = new_health
    return updated


def schedule_wake_message(user_id, event):
    """Spawn a daemon thread to LLM-generate a wake/sleep message and write it
    to pet_profile.last_wake_message / wake_message_at. Always falls back to a
    safe template on any LLM error so the column is populated even offline."""
    fallback = (
        "主人不在的时候，看山饿得只能先睡一会儿。"
        if event == "sleep"
        else "看山醒啦，又能陪主人一起看内容了。"
    )

    def runner():
        message = fallback
        try:
            result = PET_LLM.chat_json(
                "wake_message",
                {"event": event},
                expected_keys=["message"],
            )
            text = str(result.get("message") or "").strip()
            if text:
                message = text[:60]
            else:
                raise _PetLLMError("empty wake message")
        except Exception as error:
            print(f"[p0-mock] wake message fallback ({event}) for {user_id}: {error}", flush=True)
            message = fallback
        try:
            with connect_db() as conn:
                conn.execute(
                    "UPDATE pet_profile SET last_wake_message=?, wake_message_at=?, updated_at=? "
                    "WHERE user_id=?",
                    (message, now_text(), now_text(), user_id),
                )
        except Exception as error:
            print(f"[p0-mock] wake message persist failed for {user_id}: {error}", flush=True)

    PET_LLM.run_async(f"wake-message-{user_id}-{event}", runner)


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


def fetch_content_interactions(conn, user_id, content_ids):
    if not user_id or not content_ids:
        return {}
    unique_ids = [str(content_id) for content_id in dict.fromkeys(content_ids) if content_id]
    if not unique_ids:
        return {}
    placeholders = ",".join("?" for _ in unique_ids)
    rows = conn.execute(
        f"""
        SELECT content_id, action_type
        FROM pet_content_event
        WHERE user_id = ?
          AND content_id IN ({placeholders})
          AND action_type IN ('like', 'comment', 'collect')
        GROUP BY content_id, action_type
        """,
        (user_id, *unique_ids),
    ).fetchall()
    state = {content_id: {"like": False, "comment": False, "collect": False} for content_id in unique_ids}
    for row in rows:
        state.setdefault(row["content_id"], {})[row["action_type"]] = True
    return state


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


def zero_content_reward():
    return {
        "exp": 0,
        "satiety": 0,
        "mood": 0,
        "travelEnergy": 0,
        "levelUp": False,
        "stageChanged": False,
    }


def duplicate_content_event_message(action_type):
    return {
        "read": "已经阅读过这篇内容，本次不再增加经验",
        "watch": "已经观看过这条内容，本次不再增加经验",
        "like": "已经赞同过这篇内容",
        "comment": "已经评论过这篇内容，本次不再增加经验",
        "collect": "已经收藏过这篇内容",
    }.get(action_type, "已经操作过这篇内容，本次不再增加经验")


def duplicate_content_event_response(conn, user_id, content_id, action_type, decay_notice=None):
    updated_content = fetch_content(conn, content_id)
    interactions = fetch_content_interactions(conn, user_id, [content_id]).get(content_id)
    return {
        "duplicateInteraction": True,
        "duplicateContentEvent": True,
        "message": duplicate_content_event_message(action_type),
        "reward": zero_content_reward(),
        "profile": camel_profile(fetch_profile(conn, user_id), user_id),
        "content": camel_content(updated_content, interactions=interactions) if updated_content else None,
        "decayNotice": decay_notice,
    }


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


def grant_daily_signin(conn, user_id):
    """Grant daily signin reward if not yet signed today."""
    today = now_dt().strftime("%Y-%m-%d")
    conn.execute(
        "INSERT OR IGNORE INTO pet_daily_stat (user_id, stat_date, created_at, updated_at) "
        "VALUES (?, ?, ?, ?)",
        (user_id, today, now_text(), now_text()),
    )
    stat_row = conn.execute(
        "SELECT * FROM pet_daily_stat WHERE user_id = ? AND stat_date = ?",
        (user_id, today),
    ).fetchone()
    if stat_row["signed_in_at"] is not None:
        return {"alreadySignedIn": True, "signedInAt": stat_row["signed_in_at"]}
    profile = conn.execute(
        "SELECT * FROM pet_profile WHERE user_id = ?", (user_id,),
    ).fetchone()
    if profile is None or not profile["adopted"]:
        return {"error": "PET_NOT_ADOPTED"}
    new_sat = min(100, int(profile["satiety"]) + DAILY_SIGNIN_SATIETY)
    new_mood = min(100, int(profile["mood"]) + DAILY_SIGNIN_MOOD)
    new_energy = int(profile["travel_energy"]) + DAILY_SIGNIN_ENERGY
    conn.execute(
        "UPDATE pet_profile SET satiety=?, mood=?, travel_energy=?, last_growth_at=?, updated_at=? "
        "WHERE user_id=?",
        (new_sat, new_mood, new_energy, now_text(), now_text(), user_id),
    )
    conn.execute(
        "UPDATE pet_daily_stat SET signed_in_at=?, updated_at=? WHERE user_id=? AND stat_date=?",
        (now_text(), now_text(), user_id, today),
    )
    write_growth_log(conn, user_id, "daily-signin", "satiety",
                     DAILY_SIGNIN_SATIETY, profile["satiety"], new_sat,
                     "每日签到", source_type="daily_task")
    write_growth_log(conn, user_id, "daily-signin", "mood",
                     DAILY_SIGNIN_MOOD, profile["mood"], new_mood,
                     "每日签到", source_type="daily_task")
    write_growth_log(conn, user_id, "daily-signin", "travel_energy",
                     DAILY_SIGNIN_ENERGY, profile["travel_energy"], new_energy,
                     "每日签到", source_type="daily_task")
    return {
        "alreadySignedIn": False,
        "reward": {
            "satiety": DAILY_SIGNIN_SATIETY,
            "mood": DAILY_SIGNIN_MOOD,
            "travelEnergy": DAILY_SIGNIN_ENERGY,
        },
    }


def grant_pat(conn, user_id):
    """Pat the pet: small mood bump with cooldown + daily cap."""
    profile = conn.execute(
        "SELECT * FROM pet_profile WHERE user_id = ?", (user_id,),
    ).fetchone()
    if profile is None or not profile["adopted"]:
        return {"error": "PET_NOT_ADOPTED"}
    if profile["wake_status"] == "sleeping":
        return {
            "error": "PET_SLEEPING",
            "message": "看山在休眠，请先帮 ta 阅读内容唤醒",
        }
    last_pat = conn.execute(
        "SELECT created_at FROM pet_growth_log "
        "WHERE user_id = ? AND source_type = 'pat' "
        "ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    if last_pat is not None:
        try:
            last_dt = parse_time(last_pat["created_at"])
            elapsed = (now_dt() - last_dt).total_seconds()
            if elapsed < PAT_COOLDOWN_SECONDS:
                return {
                    "error": "PAT_COOLDOWN",
                    "message": "看山被摸太多了，等一下下",
                }
        except Exception:
            pass
    today = now_dt().strftime("%Y-%m-%d")
    today_count = conn.execute(
        "SELECT COUNT(*) FROM pet_growth_log "
        "WHERE user_id = ? AND source_type = 'pat' AND substr(created_at, 1, 10) = ?",
        (user_id, today),
    ).fetchone()[0]
    if today_count >= PAT_DAILY_LIMIT:
        return {
            "error": "PAT_DAILY_LIMIT",
            "message": "今天看山已经被摸够多啦",
        }
    new_mood = min(100, int(profile["mood"]) + PAT_MOOD_GAIN)
    conn.execute(
        "UPDATE pet_profile SET mood=?, updated_at=? WHERE user_id=?",
        (new_mood, now_text(), user_id),
    )
    # Direct insert (write_growth_log skips when before==after; pat needs to log
    # every event regardless of mood cap so cooldown can be measured).
    conn.execute(
        "INSERT INTO pet_growth_log "
        "(user_id, source_type, source_id, change_type, delta, before_value, after_value, reason, created_at) "
        "VALUES (?, 'pat', 'pat', 'mood', ?, ?, ?, '主人摸头', ?)",
        (user_id, new_mood - int(profile["mood"]), int(profile["mood"]), new_mood, now_text()),
    )
    mood_band = (
        "high" if new_mood >= 80 else
        "low" if new_mood < 40 else
        "mid"
    )
    reactions = {
        "high": ["蹭蹭主人的手 ♡", "嘿嘿，主人最好了", "再多摸一下嘛"],
        "mid": ["嗯——舒服", "主人摸得很温柔", "看山喜欢"],
        "low": ["主人...看山有点累", "今天精神不太好呢", "再陪陪看山好吗"],
    }
    import random as _random
    return {
        "ok": True,
        "newMood": new_mood,
        "reaction": _random.choice(reactions[mood_band]),
        "moodBand": mood_band,
    }


def last_content_active_at(conn, user_id):
    placeholders = ",".join("?" for _ in DECAY_ACTIVE_ACTIONS)
    row = conn.execute(
        f"""
        SELECT MAX(occurred_at) AS last_active_at
        FROM pet_content_event
        WHERE user_id = ?
          AND action_type IN ({placeholders})
          AND reward_status = 'granted'
        """,
        (user_id, *DECAY_ACTIVE_ACTIONS),
    ).fetchone()
    return row["last_active_at"] if row and row["last_active_at"] else None


def decay_notice_payload(logs, inactive_hours):
    if not logs:
        return None
    total_satiety = sum(item["satietyDelta"] for item in logs)
    total_mood = sum(item["moodDelta"] for item in logs)
    latest_message = logs[-1]["message"]
    return {
        "applied": True,
        "inactiveHours": inactive_hours,
        "totalSatietyDelta": total_satiety,
        "totalMoodDelta": total_mood,
        "message": latest_message,
        "logs": logs,
    }


def apply_pet_decay(conn, user_id, profile=None):
    profile = profile or fetch_profile(conn, user_id)
    if profile is None or not profile["adopted"]:
        return None

    last_active_at = last_content_active_at(conn, user_id)
    inactive_since = last_active_at or profile["last_growth_at"] or profile["created_at"]
    inactive_start = parse_time(inactive_since)
    if inactive_start == datetime.min:
        return None

    inactive_seconds = max(0, (now_dt() - inactive_start).total_seconds())
    inactive_hours_exact = inactive_seconds / 3600
    inactive_hours = int(inactive_hours_exact)
    rules = conn.execute(
        """
        SELECT *
        FROM pet_decay_config
        WHERE enabled = 1
        ORDER BY inactive_hours ASC, id ASC
        """
    ).fetchall()
    if not rules:
        return None

    current_satiety = int(profile["satiety"])
    current_mood = int(profile["mood"])
    applied_logs = []
    checked_at = now_text()

    for rule in rules:
        if inactive_hours_exact < int(rule["inactive_hours"]):
            continue
        exists = conn.execute(
            """
            SELECT 1
            FROM pet_state_decay_log
            WHERE user_id = ?
              AND decay_window = ?
              AND inactive_since = ?
            LIMIT 1
            """,
            (user_id, rule["decay_window"], inactive_since),
        ).fetchone()
        if exists:
            continue

        before_satiety = current_satiety
        before_mood = current_mood
        after_satiety = max(0, min(100, before_satiety + int(rule["satiety_delta"])))
        after_mood = max(0, min(100, before_mood + int(rule["mood_delta"])))
        actual_satiety_delta = after_satiety - before_satiety
        actual_mood_delta = after_mood - before_mood
        if actual_satiety_delta == 0 and actual_mood_delta == 0:
            continue

        source_id = f"decay:{user_id}:{inactive_since}:{rule['decay_window']}"
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO pet_state_decay_log
              (user_id, decay_window, inactive_since, checked_at, inactive_hours,
               satiety_delta, mood_delta, before_satiety, after_satiety,
               before_mood, after_mood, message, created_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                rule["decay_window"],
                inactive_since,
                checked_at,
                inactive_hours,
                actual_satiety_delta,
                actual_mood_delta,
                before_satiety,
                after_satiety,
                before_mood,
                after_mood,
                rule["message"],
                checked_at,
            ),
        )
        if cursor.rowcount:
            write_growth_log(
                conn,
                user_id,
                source_id,
                "satiety",
                actual_satiety_delta,
                before_satiety,
                after_satiety,
                f"长时间未互动，学识值自然衰减：{rule['decay_window']}",
                "decay",
            )
            write_growth_log(
                conn,
                user_id,
                source_id,
                "mood",
                actual_mood_delta,
                before_mood,
                after_mood,
                f"长时间未互动，心情自然衰减：{rule['decay_window']}",
                "decay",
            )
            current_satiety = after_satiety
            current_mood = after_mood
            applied_logs.append(
                {
                    "decayWindow": rule["decay_window"],
                    "inactiveSince": inactive_since,
                    "inactiveHours": inactive_hours,
                    "satietyDelta": actual_satiety_delta,
                    "moodDelta": actual_mood_delta,
                    "beforeSatiety": before_satiety,
                    "afterSatiety": after_satiety,
                    "beforeMood": before_mood,
                    "afterMood": after_mood,
                    "message": rule["message"],
                }
            )

    if applied_logs:
        conn.execute(
            """
            UPDATE pet_profile
            SET satiety = ?,
                mood = ?,
                updated_at = ?
            WHERE user_id = ?
            """,
            (current_satiety, current_mood, now_text(), user_id),
        )
    return decay_notice_payload(applied_logs, inactive_hours)


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
    source_id = f"follow_moments:{int(time.time() * 1000)}"

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
    new_moment_ids = []
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
                if cursor.lastrowid:
                    new_moment_ids.append(int(cursor.lastrowid))

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

        batch_id = uuid.uuid4().hex
        retry_ids = []
        if new_moment_ids:
            now = now_dt()
            for r in conn.execute(
                "SELECT id, llm_retry_count, updated_at FROM zhihu_follow_moment "
                "WHERE user_id = ? AND llm_summary_status = 'failed' AND llm_retry_count < 3",
                (user_id,),
            ).fetchall():
                try:
                    last = parse_time(r["updated_at"]) if r["updated_at"] else now - timedelta(seconds=99999)
                except Exception:
                    last = now - timedelta(seconds=99999)
                wait_secs = 30 * (2 ** int(r["llm_retry_count"] or 0))
                if (now - last).total_seconds() >= wait_secs:
                    conn.execute(
                        "UPDATE zhihu_follow_moment SET llm_summary_status='pending', updated_at=? WHERE id=?",
                        (now_text(), r["id"]),
                    )
                    retry_ids.append(int(r["id"]))
            if retry_ids:
                conn.commit()

        scheduled_ids = list(new_moment_ids) + retry_ids
        if scheduled_ids:
            schedule_follow_summary(user_id, batch_id, scheduled_ids)

        return 200, {
            "newCount": alert_count,
            "syncedNewCount": new_count,
            "latestMoment": camel_follow_moment(latest_alert),
            "reward": reward,
            "profile": profile,
            "batchId": batch_id,
            "llm": {
                "summaryPlanned": bool(scheduled_ids),
                "summaryStatus": "pending" if scheduled_ids else "skipped",
                "plannedCount": len(scheduled_ids),
                "summary": latest_alert["llm_summary"] if latest_alert else None,
            },
        }


def summarize_follow_moments(user_id, batch_id, moment_ids):
    """Generate per-moment summary + one aggregated overview for a sync batch.

    Designed to run as a daemon thread. Never raises.
    Each moment LLM call is independent; if any fails the others still proceed.
    The overview LLM is only called if at least one per-moment summary is ready.
    """
    if not moment_ids:
        return

    # 1) per-moment loop
    summaries_for_overview = []
    for moment_id in moment_ids:
        try:
            with connect_db() as conn:
                conn.execute("BEGIN IMMEDIATE")
                row = conn.execute(
                    "SELECT * FROM zhihu_follow_moment WHERE id = ? AND user_id = ?",
                    (moment_id, user_id),
                ).fetchone()
                if row is None or row["llm_summary_status"] in ("ready", "processing"):
                    conn.rollback()
                    if row is not None and row["llm_summary_status"] == "ready":
                        summaries_for_overview.append(
                            {"actor": row["actor_name"], "summary": row["llm_summary"]}
                        )
                    continue
                conn.execute(
                    "UPDATE zhihu_follow_moment SET llm_summary_status='processing', updated_at=? WHERE id=?",
                    (now_text(), moment_id),
                )
                conn.commit()
                payload = {
                    "actor_name": (row["actor_name"] or "")[:40],
                    "action_text": (row["action_text"] or "")[:30],
                    "target_title": (row["target_title"] or "")[:80],
                    "target_excerpt": (row["target_excerpt"] or "")[:200],
                    "target_author_name": (row["target_author_name"] or "")[:40],
                }
            try:
                result = PET_LLM.chat_json(
                    "follow_moment_each", payload, expected_keys=["summary"]
                )
                summary_text = str(result.get("summary") or "").strip()[:70]
                if not summary_text:
                    raise _PetLLMError("empty summary")
            except Exception as error:
                with connect_db() as conn:
                    conn.execute(
                        "UPDATE zhihu_follow_moment "
                        "SET llm_summary_status='failed', "
                        "    llm_retry_count = llm_retry_count + 1, "
                        "    llm_error = ?, updated_at = ? "
                        "WHERE id = ?",
                        (str(error)[:200], now_text(), moment_id),
                    )
                continue
            with connect_db() as conn:
                conn.execute(
                    "UPDATE zhihu_follow_moment "
                    "SET llm_summary_status='ready', llm_summary=?, "
                    "    llm_summary_model=?, llm_summary_updated_at=?, "
                    "    llm_error=NULL, updated_at=? "
                    "WHERE id=?",
                    (summary_text, PET_LLM.model_tag("follow_moment_each"),
                     now_text(), now_text(), moment_id),
                )
            summaries_for_overview.append(
                {"actor": payload["actor_name"], "summary": summary_text}
            )
        except Exception as error:
            print(f"[p0-mock] follow summary loop error for moment {moment_id}: {error}")

    # 2) aggregate overview
    moment_count = len(summaries_for_overview)
    if moment_count == 0:
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO pet_follow_moment_overview "
                "(user_id, sync_batch_id, overview_text, moment_count, status) "
                "VALUES (?, ?, '', ?, 'skipped')",
                (user_id, batch_id, 0),
            )
        return
    try:
        result = PET_LLM.chat_json(
            "follow_moment_overview",
            {"summaries": summaries_for_overview, "moment_count": moment_count},
            expected_keys=["overview"],
        )
        overview_text = str(result.get("overview") or "").strip()[:80]
        if not overview_text:
            raise _PetLLMError("empty overview")
        status = "ready"
        model_tag = PET_LLM.model_tag("follow_moment_overview")
    except Exception as error:
        print(f"[p0-mock] follow overview fallback for {batch_id}: {error}")
        overview_text = ""
        status = "failed"
        model_tag = None
    with connect_db() as conn:
        conn.execute(
            "INSERT INTO pet_follow_moment_overview "
            "(user_id, sync_batch_id, overview_text, moment_count, status, model) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, batch_id, overview_text, moment_count, status, model_tag),
        )


def schedule_follow_summary(user_id, batch_id, moment_ids):
    """Spawn a daemon thread for summarize_follow_moments. See schedule_travel_summary."""
    PET_LLM.run_async(
        f"follow-summary-{batch_id}",
        lambda: summarize_follow_moments(user_id, batch_id, moment_ids),
    )


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
    event_id = str(payload.get("eventId") or f"evt_{int(time.time() * 1000)}")
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
            conn.execute("BEGIN IMMEDIATE")
            if content_id and action_type in ("read", "watch", "like", "comment", "collect"):
                existing_action = conn.execute(
                    """
                    SELECT 1
                    FROM pet_content_event
                    WHERE user_id = ?
                      AND content_id = ?
                      AND action_type = ?
                    LIMIT 1
                    """,
                    (user_id, content_id, action_type),
                ).fetchone()
                if existing_action is not None:
                    conn.rollback()
                    return 200, duplicate_content_event_response(conn, user_id, content_id, action_type)
            decay_notice = apply_pet_decay(conn, user_id, profile)
            profile = fetch_profile(conn, user_id)
            # Snapshot sleeping state AFTER apply_pet_decay so a tier that drops
            # satiety/mood into the sleep threshold for the first time still
            # halves THIS event's reward (consistent with maybe_progress_wake
            # being called below).
            was_sleeping = (
                profile["wake_status"] == "sleeping"
                if profile is not None
                and "wake_status" in (profile.keys() if hasattr(profile, "keys") else [])
                else False
            )
            if was_sleeping:
                reward = {
                    "exp": reward["exp"] // 2,
                    "satiety": reward["satiety"] // 2,
                    "mood": reward["mood"] // 2,
                    "travelEnergy": reward["travelEnergy"] // 2,
                }
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
        write_growth_log(conn, user_id, event_id, "satiety", reward["satiety"], old["satiety"], new_satiety, "内容消费提升学识值")
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

        # Auto-grant 3-reads daily quest reward (PRD §（二）.B 表)
        if action_type in ("read", "watch"):
            today_str = now_dt().strftime("%Y-%m-%d")
            stat = conn.execute(
                "SELECT valid_read_count, valid_watch_count, quest_3reads_claimed "
                "FROM pet_daily_stat WHERE user_id = ? AND stat_date = ?",
                (user_id, today_str),
            ).fetchone()
            if stat is not None and stat["quest_3reads_claimed"] == 0:
                total_reads = (stat["valid_read_count"] or 0) + (stat["valid_watch_count"] or 0)
                if total_reads >= DAILY_QUEST_REQUIRED_READS:
                    profile_now = conn.execute(
                        "SELECT total_exp, travel_energy FROM pet_profile WHERE user_id = ?",
                        (user_id,),
                    ).fetchone()
                    # 跟正常奖励保持语义一致：sleeping 状态下 quest 奖励减半。
                    quest_exp = DAILY_QUEST_3READS_EXP // 2 if was_sleeping else DAILY_QUEST_3READS_EXP
                    quest_energy = DAILY_QUEST_3READS_ENERGY // 2 if was_sleeping else DAILY_QUEST_3READS_ENERGY
                    quest_new_exp = int(profile_now["total_exp"]) + quest_exp
                    quest_new_energy = int(profile_now["travel_energy"]) + quest_energy
                    conn.execute(
                        "UPDATE pet_profile SET total_exp=?, travel_energy=?, updated_at=? WHERE user_id=?",
                        (quest_new_exp, quest_new_energy, now_text(), user_id),
                    )
                    conn.execute(
                        "UPDATE pet_daily_stat SET quest_3reads_claimed=1, updated_at=? "
                        "WHERE user_id=? AND stat_date=?",
                        (now_text(), user_id, today_str),
                    )
                    write_growth_log(conn, user_id, "daily-quest-3reads", "total_exp",
                                     quest_exp, profile_now["total_exp"], quest_new_exp,
                                     "每日浏览 3 条内容", source_type="daily_task")
                    write_growth_log(conn, user_id, "daily-quest-3reads", "travel_energy",
                                     quest_energy, profile_now["travel_energy"], quest_new_energy,
                                     "每日浏览 3 条内容", source_type="daily_task")
                    if isinstance(reward, dict):
                        reward["dailyQuestComplete"] = True
                        reward["dailyQuestExtra"] = {
                            "exp": quest_exp,
                            "travelEnergy": quest_energy,
                        }

        # Progress sleep→wake counter when pet is sleeping and the user
        # consumed (read/watch) a piece of content. Like/comment/collect do
        # not contribute per PRD §（五.3）唤醒条件。
        wake_just_triggered = False
        if was_sleeping:
            current = conn.execute(
                "SELECT * FROM pet_profile WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            updated_after_wake = maybe_progress_wake(conn, current, action_type)
            if (updated_after_wake is not None
                    and updated_after_wake["wake_status"] == "awake"):
                wake_just_triggered = True
        conn.commit()

        new_profile = fetch_profile(conn, user_id)
        updated_content = fetch_content(conn, content_id)
        interactions = fetch_content_interactions(conn, user_id, [content_id]).get(content_id)
        new_profile_payload = camel_profile(new_profile, user_id)
        return 200, {
            "reward": {
                **reward,
                "levelUp": new_level != old["level"],
                "fromLevel": old["level"],
                "toLevel": new_level,
                "stageChanged": new_stage != old["stage"],
                "fromStage": old["stage"],
                "toStage": new_stage,
                "wasSleeping": was_sleeping,
                "wakeJustTriggered": wake_just_triggered,
            },
            "profile": new_profile_payload,
            "content": camel_content(updated_content, interactions=interactions) if updated_content else None,
            "decayNotice": decay_notice,
        }


def start_comment_assist_log(user_id, content_id, content_type, title, excerpt, full_content, _conn=None):
    """Discard any prior streaming log for (user, content), insert a new streaming row.
    Returns (log_id, payload_dict)."""
    payload = {
        "content_id": content_id,
        "content_type": content_type,
        "title": (title or "")[:80],
        "excerpt": (excerpt or "")[:200],
        "full_content_excerpt": (full_content or "")[:500],
    }
    payload_text = json.dumps(payload, ensure_ascii=False)
    own_conn = _conn is None
    conn = _conn or connect_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "UPDATE pet_comment_assist_log "
            "SET status='discarded', updated_at=? "
            "WHERE user_id=? AND content_id=? AND status='streaming'",
            (now_text(), user_id, content_id),
        )
        cursor = conn.execute(
            "INSERT INTO pet_comment_assist_log "
            "(user_id, content_id, content_type, prompt_payload, status) "
            "VALUES (?, ?, ?, ?, 'streaming')",
            (user_id, content_id, content_type, payload_text),
        )
        log_id = cursor.lastrowid
        conn.commit()
    finally:
        if own_conn:
            conn.close()
    return log_id, payload


def serve_comment_assist_sse(handler, user_id, content_id):
    """Look up the content, write a streaming log, then stream SSE chunks to the response."""
    with connect_db() as conn:
        row = conn.execute(
            "SELECT content_id, content_type, title, excerpt, full_content "
            "FROM zhihu_content_pool WHERE content_id = ?",
            (content_id,),
        ).fetchone()
    if row is None:
        handler.send_json(404, {"error": "CONTENT_NOT_FOUND"})
        return

    log_id, payload = start_comment_assist_log(
        user_id, row["content_id"], row["content_type"],
        row["title"], row["excerpt"], row["full_content"],
    )

    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream")
    handler.send_header("Cache-Control", "no-cache, no-transform")
    handler.send_header("X-Accel-Buffering", "no")
    handler.end_headers()

    def write_event(data_obj):
        line = "data: " + json.dumps(data_obj, ensure_ascii=False) + "\n\n"
        handler.wfile.write(line.encode("utf-8"))
        handler.wfile.flush()

    def write_ping():
        handler.wfile.write(b": ping\n\n")
        handler.wfile.flush()

    accumulated = []
    last_ping = time.time()
    try:
        for chunk in PET_LLM.chat_stream("comment_assist", payload, max_chars=100):
            accumulated.append(chunk)
            write_event({"chunk": chunk, "id": log_id})
            if time.time() - last_ping > 5:
                write_ping()
                last_ping = time.time()
        full_text = "".join(accumulated).strip()
        if not full_text:
            raise _PetLLMError("empty stream")
        with connect_db() as conn:
            conn.execute(
                "UPDATE pet_comment_assist_log SET status='ready', "
                "suggested_comment=?, model=?, updated_at=? WHERE id=?",
                (full_text, PET_LLM.model_tag("comment_assist"), now_text(), log_id),
            )
        write_event({"done": True, "id": log_id, "text": full_text})
    except Exception as error:
        fallback = "这题挺值得聊，我先放下评论框，主人想到啥写啥就好。"
        with connect_db() as conn:
            conn.execute(
                "UPDATE pet_comment_assist_log SET status='failed', "
                "suggested_comment=?, model=?, updated_at=? WHERE id=?",
                (fallback, PET_LLM.model_tag("comment_assist"), now_text(), log_id),
            )
        try:
            write_event({"chunk": fallback, "id": log_id, "fallback": True})
            write_event({"done": True, "id": log_id, "text": fallback, "fallback": True})
        except Exception:
            pass
        print(f"[p0-mock] comment_assist fallback for log {log_id}: {error}")


def fetch_theme_config(conn, theme):
    return conn.execute(
        "SELECT * FROM pet_travel_theme_config WHERE theme = ?",
        (theme,),
    ).fetchone()


def theme_meta(theme):
    return TRAVEL_THEME_MESSAGES[normalize_theme(theme)]


def camel_external_content(row):
    if row is None:
        return None
    meta = parse_json_dict(row["meta"])
    return {
        "id": row["source_ref"],
        "source": row["source"],
        "sourceRef": row["source_ref"],
        "rank": row["rank"],
        "title": row["title"],
        "excerpt": row["excerpt"] or "",
        "author": row["author"] or "",
        "url": row["url"] or "",
        "thumbnailUrl": row["thumbnail_url"] or "",
        "meta": meta,
        "claimed": bool(row["claimed"]),
    }


def fetch_travel_contents(conn, travel_id):
    return [
        camel_external_content(row)
        for row in conn.execute(
            """
            SELECT * FROM pet_travel_external_content
            WHERE travel_id = ?
            ORDER BY rank ASC, id ASC
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
    cover_style = LEGACY_TRAVEL_THEME_MAP.get(row["cover_style"], row["cover_style"])
    keys = row.keys()
    highlights = parse_json_array(row["llm_highlights"]) if "llm_highlights" in keys else []
    payload = {
        "travelId": row["travel_id"],
        "userId": row["user_id"],
        "themeTitle": row["theme_title"],
        "routeText": row["route_text"],
        "petQuote": row["pet_quote"],
        "coverStyle": cover_style,
        "llmSummaryStatus": row["llm_summary_status"] if "llm_summary_status" in keys else "skipped",
        "llmSummary": row["llm_summary"] if "llm_summary" in keys else None,
        "llmPetQuote": row["llm_pet_quote"] if "llm_pet_quote" in keys else None,
        "llmHighlights": highlights,
        "llmSummaryUpdatedAt": row["llm_summary_updated_at"] if "llm_summary_updated_at" in keys else None,
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
    if profile["travel_status"] == "cooldown" and parse_time(profile["cooldown_until"]) <= now_dt():
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
    if travel and travel["status"] == "traveling" and parse_time(travel["expected_return_at"]) <= now_dt():
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
    profile_keys = profile.keys() if hasattr(profile, "keys") else []
    if "wake_status" in profile_keys and profile["wake_status"] == "sleeping":
        try:
            progress = int(profile["wake_progress"] or 0)
        except (TypeError, ValueError):
            progress = 0
        remaining = max(WAKE_REQUIRED_READS - progress, 1)
        return f"看山在休眠中，先帮 ta 读 {remaining} 条内容唤醒"
    if active_travel and active_travel["status"] == "traveling":
        return "刘看山正在游历中"
    if active_travel and active_travel["status"] == "returned":
        return "刘看山已经归来，先领取带回的内容"
    if profile["travel_status"] == "cooldown" and parse_time(profile["cooldown_until"]) > now_dt():
        return "刘看山刚旅行回来，正在休息冷却"
    if profile["level"] < 2:
        return "Lv.2 后可以出门游历"
    if profile["satiety"] < TRAVEL_MIN_SATIETY:
        return f"学识值达到 {TRAVEL_MIN_SATIETY} 后可以出门"
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
    if requested in TRAVEL_THEME_MESSAGES or requested in LEGACY_TRAVEL_THEME_MAP:
        return normalize_theme(requested)
    user_tags = recent_user_tags(conn, user_id)
    best_theme = "polar"
    best_score = -1
    for row in conn.execute("SELECT * FROM pet_travel_theme_config").fetchall():
        preferred = set(parse_json_array(row["preferred_tags"]))
        score = sum(1 for tag in user_tags if tag in preferred)
        if score > best_score:
            best_score = score
            best_theme = row["theme"]
    return best_theme


def select_travel_materials(conn, user_id, theme, limit):
    """Pick the raw materials this travel will bring back.

    polar  -> snapshots from the user's recent zhihu_follow_moment rows
    hotspot -> live snapshots from the zhihu hot-list API (with fallback)

    Each material is a dict ready to insert into pet_travel_external_content,
    with at least: source, source_ref, title, excerpt, author, url, thumbnail_url, meta.
    """
    if theme == "polar":
        return _select_follow_moment_materials(conn, user_id, limit)
    if theme == "hotspot":
        return _select_hot_list_materials(conn, limit)
    return []


def _select_follow_moment_materials(conn, user_id, limit):
    # Avoid bringing back the exact same moments that a recent travel already brought back.
    recent_refs = {
        row["source_ref"]
        for row in conn.execute(
            """
            SELECT source_ref FROM pet_travel_external_content
            WHERE source = 'follow_moment'
              AND travel_id IN (
                SELECT travel_id FROM pet_travel_event
                WHERE user_id = ?
                ORDER BY started_at DESC
                LIMIT 3
              )
            """,
            (user_id,),
        ).fetchall()
    }
    rows = conn.execute(
        """
        SELECT moment_key, actor_name, action_text, action_time,
               target_title, target_excerpt, target_author_name, raw_payload
        FROM zhihu_follow_moment
        WHERE user_id = ?
          AND (
            (target_title IS NOT NULL AND target_title != '')
            OR (target_excerpt IS NOT NULL AND target_excerpt != '')
          )
        ORDER BY action_time DESC, id DESC
        LIMIT ?
        """,
        (user_id, limit * 4),
    ).fetchall()

    def to_material(row):
        excerpt = (row["target_excerpt"] or "").strip()
        title = (row["target_title"] or "").strip()
        if not title:
            actor = (row["actor_name"] or "").strip()
            action = (row["action_text"] or "").strip()
            author = (row["target_author_name"] or "").strip()
            if author and action:
                title = f"{actor or '关注的人'}{action}{author}的内容"
            elif excerpt:
                title = excerpt[:24] + ("…" if len(excerpt) > 24 else "")
            else:
                title = "关注列表里的一条动态"
        return {
            "source": "follow_moment",
            "source_ref": row["moment_key"],
            "title": title,
            "excerpt": excerpt,
            "author": row["target_author_name"] or row["actor_name"] or "",
            "url": _extract_target_url(row["raw_payload"]),
            "thumbnail_url": None,
            "meta": {
                "actorName": row["actor_name"],
                "actionText": row["action_text"],
                "actionTime": row["action_time"],
                "targetAuthor": row["target_author_name"],
            },
        }

    fresh, overflow = [], []
    seen = set()
    for row in rows:
        ref = row["moment_key"]
        if ref in seen:
            continue
        seen.add(ref)
        target = fresh if ref not in recent_refs else overflow
        target.append(to_material(row))
    materials = fresh[:limit]
    if len(materials) < limit:
        materials.extend(overflow[: limit - len(materials)])
    return materials


def _select_hot_list_materials(conn, limit):
    hot = fetch_hot_items(limit=max(limit, 5))
    items = hot.get("items") or []
    materials = []
    for item in items[:limit]:
        url = item.get("url") or ""
        ref = url or hashlib.sha256(
            json.dumps(item, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()
        meta = {
            "rank": item.get("rank"),
            "heatText": item.get("heatText"),
            "contentType": item.get("contentType"),
            "debut": bool(item.get("debut")),
            "source": hot.get("source"),
        }
        materials.append(
            {
                "source": "hot_list",
                "source_ref": ref,
                "title": str(item.get("title") or "").strip(),
                "excerpt": str(item.get("summary") or "").strip(),
                "author": "",
                "url": url,
                "thumbnail_url": item.get("thumbnailUrl") or None,
                "meta": meta,
            }
        )
    return materials


def _extract_target_url(raw_payload_text):
    if not raw_payload_text:
        return ""
    try:
        payload = json.loads(raw_payload_text)
    except (TypeError, ValueError):
        return ""
    target = payload.get("target") if isinstance(payload, dict) else None
    if not isinstance(target, dict):
        return ""
    url = first_non_empty(
        target.get("url"),
        target.get("link"),
        target.get("question_url") if isinstance(target.get("question"), dict) else None,
    )
    return normalize_zhihu_web_url(url) if url else ""


def build_travel_llm_payload(theme, materials, recent_user_tags_list):
    meta = theme_meta(theme)
    materials_payload = []
    for material in materials:
        meta_value = parse_json_dict(material["meta"])
        materials_payload.append(
            {
                "source": material["source"],
                "title": (material["title"] or "")[:80],
                "excerpt": (material["excerpt"] or "")[:200],
                "author": (material["author"] or "")[:40],
                "actor_name": str(meta_value.get("actorName") or "")[:40],
                "action_text": str(meta_value.get("actionText") or "")[:30],
                "heat_text": str(meta_value.get("heatText") or "")[:30],
                "rank": meta_value.get("rank"),
            }
        )
    return {
        "travel_theme": theme,
        "theme_title": meta["title"],
        "report_focus": "关注的人最近都在分享什么" if theme == "polar" else "知乎热榜上大家正在讨论什么",
        "materials": materials_payload,
        "recent_user_tags": recent_user_tags_list[:10],
    }


def summarize_travel_handbook(user_id, travel_id, theme):
    """Generate the travel-handbook LLM summary on its own connection. Never raises."""
    payload = None
    with connect_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        handbook = conn.execute(
            "SELECT * FROM pet_travel_handbook WHERE travel_id = ?",
            (travel_id,),
        ).fetchone()
        if handbook is None or handbook["llm_summary_status"] in ("ready", "processing"):
            conn.rollback()
            return

        materials = conn.execute(
            """
            SELECT source, title, excerpt, author, meta
            FROM pet_travel_external_content
            WHERE travel_id = ?
            ORDER BY rank ASC, id ASC
            """,
            (travel_id,),
        ).fetchall()
        if not materials:
            conn.execute(
                "UPDATE pet_travel_handbook SET llm_summary_status = 'skipped', updated_at = ? WHERE travel_id = ?",
                (now_text(), travel_id),
            )
            conn.commit()
            return

        payload = build_travel_llm_payload(theme, materials, recent_user_tags(conn, user_id, limit=20))
        conn.execute(
            "UPDATE pet_travel_handbook SET llm_summary_status = 'processing', updated_at = ? WHERE travel_id = ?",
            (now_text(), travel_id),
        )
        conn.commit()

    try:
        result = PET_LLM.chat_json(
            "travel_handbook",
            payload,
            expected_keys=["summary"],
        )
        summary = str(result.get("summary") or "").strip()
        pet_quote = str(result.get("pet_quote") or "").strip()
        raw_highlights = result.get("highlights") if isinstance(result.get("highlights"), list) else []
        highlights = []
        for item in raw_highlights[:5]:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()[:40]
            reason = str(item.get("reason") or "").strip()[:40]
            if not title:
                continue
            highlights.append({"title": title, "reason": reason})
        if not summary:
            raise _PetLLMError("empty summary")
    except Exception as error:
        print(f"[p0-mock] travel summary fallback for {travel_id}: {error}")
        with connect_db() as conn:
            conn.execute(
                "UPDATE pet_travel_handbook SET llm_summary_status = 'failed', updated_at = ? WHERE travel_id = ?",
                (now_text(), travel_id),
            )
        return

    highlights_text = json.dumps(highlights, ensure_ascii=False) if highlights else None
    model_tag = PET_LLM.model_tag("travel_handbook")
    with connect_db() as conn:
        conn.execute(
            """
            UPDATE pet_travel_handbook
            SET llm_summary_status = 'ready',
                llm_summary = ?,
                llm_pet_quote = ?,
                llm_highlights = ?,
                llm_summary_model = ?,
                llm_summary_updated_at = ?,
                updated_at = ?
            WHERE travel_id = ?
            """,
            (summary, pet_quote or None, highlights_text, model_tag, now_text(), now_text(), travel_id),
        )


def ensure_handbook_summaries(user_id, rows, *, max_calls=1):
    """Best-effort LLM trigger when the user opens the handbook list.

    The primary path is the post-start_travel background worker
    (`schedule_travel_summary`); this is only a fallback for entries that
    somehow stayed in pending / failed (e.g. LLM was misconfigured at
    travel-start time but is now reachable, or the worker died mid-call).

    To avoid blocking the user's GET response on N × LLM_TIMEOUT_SEC seconds,
    only `max_calls` summaries are produced per request. The rest will be
    picked up on the next visit, or by a future background trigger.
    """
    eligible = [row for row in rows if row["llm_summary_status"] in ("pending", "failed")]
    if not eligible:
        return rows
    targets = eligible[:max_calls]
    target_ids = [row["travel_id"] for row in targets]
    themes = {}
    with connect_db() as conn:
        for travel_id in target_ids:
            travel_row = fetch_travel(conn, travel_id)
            if travel_row is not None:
                themes[travel_id] = travel_row["theme"]
    for travel_id in target_ids:
        theme = themes.get(travel_id)
        if not theme:
            continue
        try:
            summarize_travel_handbook(user_id, travel_id, theme)
        except Exception as error:
            print(f"[p0-mock] ensure_handbook_summaries error for {travel_id}: {error}")
    refreshed = {}
    with connect_db() as conn:
        placeholders = ",".join("?" for _ in target_ids)
        for row in conn.execute(
            f"SELECT * FROM pet_travel_handbook WHERE travel_id IN ({placeholders})",
            target_ids,
        ).fetchall():
            refreshed[row["travel_id"]] = row
    return [refreshed.get(row["travel_id"], row) for row in rows]


def schedule_travel_summary(user_id, travel_id, theme):
    """Spawn a daemon thread that runs summarize_travel_handbook off the request path.

    Called right after the start_travel transaction commits, so the user's POST
    returns immediately and the LLM call (8-30s typical) overlaps with the
    travel duration timer. By the time the user opens the handbook, the
    summary is usually already 'ready' — no GET handler ever has to wait."""

    def _runner():
        try:
            summarize_travel_handbook(user_id, travel_id, theme)
        except Exception as error:
            print(f"[p0-mock] travel summary worker error for {travel_id}: {error}")

    thread = threading.Thread(target=_runner, name=f"travel-summary-{travel_id}", daemon=True)
    thread.start()


def travel_status_payload(conn, user_id):
    decay_notice = apply_pet_decay(conn, user_id)
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
        "decayNotice": decay_notice,
    }


def start_travel(user_id, requested_theme="auto"):
    with connect_db() as conn:
        conn.execute("BEGIN")
        decay_notice = apply_pet_decay(conn, user_id)
        profile, active_travel = refresh_travel_status(conn, user_id)
        reason = travel_block_reason(profile, active_travel)
        if reason:
            conn.commit()
            return 409, {"error": "TRAVEL_NOT_READY", "message": reason, "decayNotice": decay_notice}

        theme = choose_travel_theme(conn, user_id, requested_theme)
        theme_row = fetch_theme_config(conn, theme)
        meta = theme_meta(theme)
        energy_cost = theme_row["energy_cost"] if theme_row else TRAVEL_DEFAULT_ENERGY_COST
        raw_duration = theme_row["duration_sec"] if theme_row else 60
        duration_sec = max(5, int(raw_duration / max(TRAVEL_SPEEDUP, 0.0001)))
        material_count = 6 if theme == "hotspot" else 5
        materials = select_travel_materials(conn, user_id, theme, material_count)
        if not materials:
            conn.commit()
            empty_message = "你还没有关注动态，看山先在家里陪你" if theme == "polar" else "热榜暂时没有取到内容"
            return 409, {"error": "TRAVEL_CONTENT_EMPTY", "message": empty_message, "decayNotice": decay_notice}

        travel_id = f"travel_{user_id}_{int(time.time() * 1000)}"
        started_at = now_text()
        expected_return_at = future_text(seconds=duration_sec)
        conn.execute(
            """
            INSERT INTO pet_travel_event
              (travel_id, user_id, theme, status, energy_cost, started_at,
               expected_return_at, message, reward_exp, reward_mood, reward_energy,
               created_at, updated_at)
            VALUES
              (?, ?, ?, 'traveling', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                travel_id, user_id, theme, energy_cost, started_at, expected_return_at,
                meta["start"], TRAVEL_CLAIM_EXP, TRAVEL_CLAIM_MOOD, TRAVEL_CLAIM_ENERGY,
                now_text(), now_text(),
            ),
        )
        for index, material in enumerate(materials, start=1):
            conn.execute(
                """
                INSERT INTO pet_travel_external_content
                  (travel_id, source, source_ref, rank, title, excerpt, author, url, thumbnail_url, meta,
                   reward_exp, reward_mood, reward_energy, created_at, updated_at)
                VALUES
                  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
                """,
                (
                    travel_id,
                    material["source"],
                    material["source_ref"],
                    index,
                    material["title"],
                    material.get("excerpt"),
                    material.get("author"),
                    material.get("url"),
                    material.get("thumbnail_url"),
                    json.dumps(material.get("meta") or {}, ensure_ascii=False),
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
    schedule_travel_summary(user_id, travel_id, theme)
    with connect_db() as conn:
        return 200, {
            "travel": camel_travel(travel, conn, include_contents=False),
            "profile": camel_profile(fetch_profile(conn, user_id), user_id),
            "message": meta["start"],
            "decayNotice": decay_notice,
        }


def return_travel(user_id, force=True):
    with connect_db() as conn:
        conn.execute("BEGIN")
        profile, travel = refresh_travel_status(conn, user_id)
        if travel is None or travel["status"] not in ("traveling", "returned"):
            conn.rollback()
            return 409, {"error": "NO_ACTIVE_TRAVEL", "message": "当前没有进行中的游历"}
        if travel["status"] == "traveling":
            if not force and parse_time(travel["expected_return_at"]) > now_dt():
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

        old = profile
        # Reward is per-travel (stored on pet_travel_event), not per-material — bringing
        # back more snapshots is for richer LLM summaries, not bigger payouts.
        keys = travel.keys()
        exp_reward = int(travel["reward_exp"]) if "reward_exp" in keys else TRAVEL_CLAIM_EXP
        mood_reward = int(travel["reward_mood"]) if "reward_mood" in keys else TRAVEL_CLAIM_MOOD
        energy_reward = int(travel["reward_energy"]) if "reward_energy" in keys else TRAVEL_CLAIM_ENERGY
        new_total_exp = old["total_exp"] + exp_reward
        new_mood = min(100, old["mood"] + mood_reward)
        new_travel_energy = old["travel_energy"] + energy_reward
        level_row = fetch_level(conn, new_total_exp)
        new_level = level_row["level"] if level_row else old["level"]
        new_stage = level_row["stage"] if level_row else old["stage"]
        cooldown_until = future_text(minutes=TRAVEL_COOLDOWN_MINUTES)

        conn.execute(
            """
            UPDATE pet_travel_external_content
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

    def require_admin_json(self):
        session = self.require_auth_json()
        if session is None:
            return None
        with connect_db() as conn:
            user = fetch_user(conn, session["user_id"])
        if not is_admin_user(user):
            self.send_json(403, {"error": "ADMIN_REQUIRED", "message": "当前账号无管理权限"})
            return None
        return session

    def require_auth_page(self, next_url):
        session = self.get_current_session()
        if session is None:
            self.send_redirect(f"/auth/login?next={quote(safe_next_url(next_url))}")
            return None
        return session

    def require_admin_page(self, next_url):
        session = self.require_auth_page(next_url)
        if session is None:
            return None
        with connect_db() as conn:
            user = fetch_user(conn, session["user_id"])
        if not is_admin_user(user):
            self.send_error(403, "Forbidden", "当前账号无管理权限")
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

        if path == "/admin":
            session = self.require_admin_page(self.path)
            if session is None:
                return
            self.send_file(STATIC_DIR / "index.html")
            return

        if path in ("/", "/people/p2wcex", "/hot", "/follow", "/community"):
            session = self.require_auth_page(self.path)
            if session is None:
                return
            self.send_file(STATIC_DIR / "index.html")
            return

        if path == "/api/admin/overview":
            session = self.require_admin_json()
            if session is None:
                return
            with connect_db() as conn:
                self.send_json(200, admin_overview_payload(conn))
            return

        if path == "/api/p0/pet/profile":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            with connect_db() as conn:
                decay_notice = apply_pet_decay(conn, user_id)
                profile_row = fetch_profile(conn, user_id)
                visual = fetch_level_visual(conn, profile_row["level"]) if profile_row else None
                self.send_json(200, {
                    "profile": camel_profile(profile_row, user_id, visual),
                    "decayNotice": decay_notice,
                })
            return
        if path == "/api/p0/pet/daily-stat":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            user_id = session["user_id"]
            stat_date = (qs.get("date") or [now_dt().date().isoformat()])[0]
            with connect_db() as conn:
                row = conn.execute(
                    "SELECT * FROM pet_daily_stat WHERE user_id = ? AND stat_date = ?",
                    (user_id, stat_date),
                ).fetchone()
                self.send_json(200, {
                    "dailyStat": camel_daily_stat(row),
                    "dailyStatRaw": row_to_dict(row),
                })
            return

        if path == "/api/p0/pet/growth-logs":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            limit = max(1, min(int((qs.get("limit") or [60])[0]), 200))
            user_id = session["user_id"]
            with connect_db() as conn:
                decay_notice = apply_pet_decay(conn, user_id)
                rows = conn.execute(
                    """
                    SELECT *
                    FROM pet_growth_log
                    WHERE user_id = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (user_id, limit),
                ).fetchall()
                self.send_json(200, {
                    "logs": [camel_growth_log(row) for row in rows],
                    "profile": camel_profile(fetch_profile(conn, user_id), user_id),
                    "decayNotice": decay_notice,
                })
            return

        if path == "/api/p0/contents":
            qs = parse_qs(parsed.query)
            limit = int((qs.get("limit") or [20])[0])
            limit = max(1, min(limit, 100))
            session = self.get_current_session()
            user_id = session["user_id"] if session else None
            with connect_db() as conn:
                rows = fetch_contents(conn, limit)
                interaction_map = fetch_content_interactions(
                    conn,
                    user_id,
                    [row["content_id"] for row in rows],
                )
                contents = [
                    camel_content(row, interactions=interaction_map.get(row["content_id"]))
                    for row in rows
                ]
                self.send_json(200, {"contents": contents})
            return

        if path in ("/api/p0/hot", "/api/p0/hot-list"):
            qs = parse_qs(parsed.query)
            limit = max(1, min(int((qs.get("limit") or qs.get("Limit") or [30])[0]), 30))
            self.send_json(200, fetch_hot_items(limit))
            return

        if path == "/api/p0/follow-moments":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            page = max(0, int((qs.get("page") or [0])[0]))
            per_page = max(1, min(int((qs.get("per_page") or qs.get("perPage") or qs.get("limit") or [20])[0]), 50))
            with connect_db() as conn:
                token = fetch_oauth_token(conn, session["user_id"])
                if token is not None:
                    try:
                        self.send_json(200, fetch_zhihu_moments_payload(token["access_token"], page=page, per_page=per_page))
                    except Exception as error:
                        self.send_json(502, {"error": "FOLLOW_MOMENTS_FETCH_FAILED", "message": str(error)})
                    return
                if AUTH_MODE != "mock":
                    self.send_json(409, {
                        "error": "OAUTH_TOKEN_REQUIRED",
                        "message": "缺少知乎 OAuth token，请重新登录",
                    })
                    return
                rows = conn.execute(
                    """
                    SELECT *
                    FROM zhihu_follow_moment
                    ORDER BY action_time DESC, id DESC
                    LIMIT ?
                    """,
                    (per_page,),
                ).fetchall()
                self.send_json(200, {"data": [raw_follow_moment(row) for row in rows]})
            return

        if path == "/api/p0/follow-moments/overview":
            session = self.require_auth_json()
            if session is None:
                return
            session_user_id = session["user_id"]
            qs = parse_qs(parsed.query)
            batch_id = (qs.get("sync_batch_id") or qs.get("batchId") or [""])[0]
            if not batch_id:
                self.send_json(400, {"error": "BATCH_ID_REQUIRED"})
                return
            with connect_db() as conn:
                ov = conn.execute(
                    "SELECT * FROM pet_follow_moment_overview "
                    "WHERE user_id = ? AND sync_batch_id = ?",
                    (session_user_id, batch_id),
                ).fetchone()
                if ov is None:
                    self.send_json(200, {
                        "status": "pending",
                        "overviewText": "",
                        "momentCount": 0,
                        "summaries": [],
                    })
                    return
                limit = max(int(ov["moment_count"] or 0), 5)
                rows = conn.execute(
                    "SELECT moment_key, actor_name, llm_summary_status, llm_summary "
                    "FROM zhihu_follow_moment "
                    "WHERE user_id = ? "
                    "ORDER BY id DESC LIMIT ?",
                    (session_user_id, limit),
                ).fetchall()
                summaries = [
                    {
                        "key": r["moment_key"],
                        "actorName": r["actor_name"],
                        "summary": r["llm_summary"] or "",
                        "status": r["llm_summary_status"],
                    }
                    for r in rows
                ]
            self.send_json(200, {
                "status": ov["status"],
                "overviewText": ov["overview_text"] or "",
                "momentCount": ov["moment_count"],
                "consumedAt": ov["consumed_at"],
                "summaries": summaries,
            })
            return

        if path == "/api/p1/comment/assist":
            session = self.require_auth_json()
            if session is None:
                return
            params = parse_qs(parsed.query)
            content_id = (params.get("content_id") or params.get("contentId") or [""])[0]
            if not content_id:
                self.send_json(400, {"error": "CONTENT_ID_REQUIRED"})
                return
            serve_comment_assist_sse(self, session["user_id"], content_id)
            return

        if path == "/api/p1/community/ring":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            page_num = int((qs.get("pageNum") or qs.get("page_num") or [1])[0])
            page_size = int((qs.get("pageSize") or qs.get("page_size") or [20])[0])
            try:
                self.send_json(200, fetch_community_ring(page_num=page_num, page_size=page_size))
            except Exception as error:
                status = 409 if str(error) == "COMMUNITY_CONFIG_MISSING" else 502
                self.send_json(status, {"error": "COMMUNITY_FETCH_FAILED", "message": str(error)})
            return

        if path == "/api/p1/community/comments":
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            content_token = (qs.get("contentToken") or qs.get("content_token") or [""])[0]
            content_type = (qs.get("contentType") or qs.get("content_type") or ["pin"])[0]
            page_num = int((qs.get("pageNum") or qs.get("page_num") or [1])[0])
            page_size = int((qs.get("pageSize") or qs.get("page_size") or [20])[0])
            if not content_token:
                self.send_json(400, {"error": "CONTENT_TOKEN_REQUIRED"})
                return
            try:
                self.send_json(200, fetch_community_comments(content_token, content_type, page_num, page_size))
            except Exception as error:
                status = 409 if str(error) == "COMMUNITY_CONFIG_MISSING" else 502
                self.send_json(status, {"error": "COMMUNITY_COMMENTS_FAILED", "message": str(error)})
            return

        if path == "/api/p1/pet/level-visuals":
            session = self.require_auth_json()
            if session is None:
                return
            with connect_db() as conn:
                rows = conn.execute(
                    "SELECT * FROM pet_level_visual_config ORDER BY level ASC"
                ).fetchall()
                self.send_json(200, {"visuals": [camel_level_visual(row) for row in rows]})
            return

        if path in ("/api/p1/leaderboard/pet-level", "/api/p1/leaderboard/travel-count"):
            session = self.require_auth_json()
            if session is None:
                return
            qs = parse_qs(parsed.query)
            limit = max(1, min(int((qs.get("limit") or [50])[0]), 100))
            rank_type = "travel_count" if path.endswith("/travel-count") else "pet_level"
            with connect_db() as conn:
                self.send_json(200, leaderboard_payload(conn, session["user_id"], rank_type, limit))
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
            user_id = session["user_id"]
            with connect_db() as conn:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM pet_travel_handbook
                    WHERE user_id = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (user_id, limit),
                ).fetchall()
            rows = ensure_handbook_summaries(user_id, rows)
            with connect_db() as conn:
                self.send_json(200, {"handbook": [camel_handbook(row, conn, include_contents=True) for row in rows]})
            return

        if path.startswith("/api/p1/travel/handbook/"):
            session = self.require_auth_json()
            if session is None:
                return
            travel_id = unquote(path.removeprefix("/api/p1/travel/handbook/"))
            user_id = session["user_id"]
            with connect_db() as conn:
                row = conn.execute(
                    """
                    SELECT *
                    FROM pet_travel_handbook
                    WHERE user_id = ? AND travel_id = ?
                    """,
                    (user_id, travel_id),
                ).fetchone()
            if row is None:
                self.send_json(404, {"error": "HANDBOOK_NOT_FOUND"})
                return
            rows = ensure_handbook_summaries(user_id, [row])
            with connect_db() as conn:
                self.send_json(200, {"entry": camel_handbook(rows[0], conn, include_contents=True)})
            return

        if path.startswith("/api/p0/contents/"):
            content_id = unquote(path.removeprefix("/api/p0/contents/"))
            session = self.get_current_session()
            user_id = session["user_id"] if session else None
            with connect_db() as conn:
                interactions = fetch_content_interactions(conn, user_id, [content_id]).get(content_id)
                content = camel_content(fetch_content(conn, content_id), include_full=True, interactions=interactions)
                if content is None:
                    self.send_json(404, {"error": "CONTENT_NOT_FOUND"})
                else:
                    self.send_json(200, {"content": content})
            return

        self.send_error(404)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/admin":
            session = self.require_admin_page(self.path)
            if session is None:
                return
            target = STATIC_DIR / "index.html"
        elif path in ("/", "/people/p2wcex", "/hot", "/follow", "/community"):
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
            session = self.require_admin_json()
            if session is None:
                return
            user_id = session["user_id"]
            with connect_db() as conn:
                travel_ids = [row["travel_id"] for row in conn.execute("SELECT travel_id FROM pet_travel_event WHERE user_id = ?", (user_id,)).fetchall()]
                if travel_ids:
                    placeholders = ",".join("?" for _ in travel_ids)
                    conn.execute(f"DELETE FROM pet_travel_external_content WHERE travel_id IN ({placeholders})", travel_ids)
                    conn.execute(f"DELETE FROM pet_travel_handbook WHERE travel_id IN ({placeholders})", travel_ids)
                conn.execute("DELETE FROM pet_travel_event WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM pet_growth_log WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM pet_content_event WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM pet_state_decay_log WHERE user_id = ?", (user_id,))
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

        if path == "/api/p0/follow-moments/overview/consume":
            session = self.require_auth_json()
            if session is None:
                return
            session_user_id = session["user_id"]
            batch_id = str(body.get("batchId") or body.get("sync_batch_id") or "").strip()
            if not batch_id:
                self.send_json(400, {"error": "BATCH_ID_REQUIRED"})
                return
            with connect_db() as conn:
                conn.execute(
                    "UPDATE pet_follow_moment_overview "
                    "SET consumed_at = ?, updated_at = ? "
                    "WHERE user_id = ? AND sync_batch_id = ? AND consumed_at IS NULL",
                    (now_text(), now_text(), session_user_id, batch_id),
                )
            self.send_json(200, {"ok": True})
            return

        if path == "/api/p1/comment/submit":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            assist_log_id = body.get("assistLogId")
            content_id = str(body.get("contentId") or "").strip()
            comment_text = str(body.get("commentText") or "").strip()
            if not content_id or not comment_text:
                self.send_json(400, {"error": "MISSING_FIELDS"})
                return
            char_len = len(comment_text)
            if char_len < 6:
                self.send_json(400, {"error": "COMMENT_TOO_SHORT", "message": "评论太短了，看山也想多说几句"})
                return
            if char_len > 200:
                self.send_json(400, {"error": "COMMENT_TOO_LONG"})
                return
            used_as_is = 0
            content_type = "article"
            with connect_db() as conn:
                content_row = conn.execute(
                    "SELECT content_type FROM zhihu_content_pool WHERE content_id = ?",
                    (content_id,),
                ).fetchone()
                if content_row is not None and content_row["content_type"]:
                    content_type = content_row["content_type"]
                if assist_log_id:
                    log_row = conn.execute(
                        "SELECT id, suggested_comment FROM pet_comment_assist_log "
                        "WHERE id = ? AND user_id = ?",
                        (assist_log_id, user_id),
                    ).fetchone()
                    if log_row is not None:
                        suggested = (log_row["suggested_comment"] or "").strip()
                        if suggested and suggested == comment_text:
                            used_as_is = 1
                        conn.execute(
                            "UPDATE pet_comment_assist_log "
                            "SET status='used', final_comment=?, used_as_is=?, updated_at=? "
                            "WHERE id=?",
                            (comment_text, used_as_is, now_text(), assist_log_id),
                        )
            event_payload = {
                "eventId": f"comment_{user_id}_{int(time.time() * 1000)}",
                "contentId": content_id,
                "contentType": content_type,
                "actionType": "comment",
                "occurredAt": now_text(),
            }
            status_code, body_resp = apply_content_event(event_payload, user_id)
            if status_code != 200:
                self.send_json(status_code, body_resp)
                return
            body_resp["usedAsIs"] = bool(used_as_is)
            body_resp["assistLogId"] = assist_log_id
            self.send_json(200, body_resp)
            return

        if path == "/api/p1/comment/discard":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            log_id = body.get("assistLogId")
            if not log_id:
                self.send_json(400, {"error": "LOG_ID_REQUIRED"})
                return
            with connect_db() as conn:
                conn.execute(
                    "UPDATE pet_comment_assist_log SET status='discarded', updated_at=? "
                    "WHERE id=? AND user_id=? AND status IN ('streaming','ready','failed')",
                    (now_text(), log_id, user_id),
                )
            self.send_json(200, {"ok": True})
            return

        if path == "/api/p1/daily/sign-in":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            with connect_db() as conn:
                conn.execute("BEGIN IMMEDIATE")
                result = grant_daily_signin(conn, user_id)
                conn.commit()
            if result.get("error"):
                self.send_json(409, {"error": result["error"]})
                return
            with connect_db() as conn:
                result["profile"] = camel_profile(fetch_profile(conn, user_id), user_id)
            self.send_json(200, result)
            return

        if path == "/api/p1/pet/pat":
            session = self.require_auth_json()
            if session is None:
                return
            user_id = session["user_id"]
            with connect_db() as conn:
                conn.execute("BEGIN IMMEDIATE")
                result = grant_pat(conn, user_id)
                conn.commit()
            if result.get("error"):
                code = 400 if result["error"] == "PET_NOT_ADOPTED" else 409
                self.send_json(code, result)
                return
            with connect_db() as conn:
                result["profile"] = camel_profile(fetch_profile(conn, user_id), user_id)
            self.send_json(200, result)
            return

        if path == "/api/p1/community/reaction":
            session = self.require_auth_json()
            if session is None:
                return
            content_token = str(body.get("contentToken") or body.get("content_token") or "")
            content_type = str(body.get("contentType") or body.get("content_type") or "pin")
            action_value = int(body.get("actionValue") if body.get("actionValue") is not None else body.get("action_value") or 1)
            if not content_token:
                self.send_json(400, {"error": "CONTENT_TOKEN_REQUIRED"})
                return
            try:
                upstream = send_community_reaction(content_token, content_type, action_value)
                reward = None
                profile = None
                if action_value == 1:
                    status, response = apply_content_event(
                        {
                            "eventId": f"community_{content_type}_{content_token}_like_{int(time.time() * 1000)}",
                            "contentId": f"community_{content_token}",
                            "contentType": "pin" if content_type == "pin" else "comment",
                            "actionType": "like",
                            "occurredAt": now_text(),
                        },
                        session["user_id"],
                    )
                    if status == 200:
                        reward = response.get("reward")
                        profile = response.get("profile")
                self.send_json(200, {"ok": True, "upstream": upstream.get("data"), "reward": reward, "profile": profile})
            except Exception as error:
                status = 409 if str(error) == "COMMUNITY_CONFIG_MISSING" else 502
                self.send_json(status, {"error": "COMMUNITY_REACTION_FAILED", "message": str(error)})
            return

        if path == "/api/p1/community/comment":
            session = self.require_auth_json()
            if session is None:
                return
            content_token = str(body.get("contentToken") or body.get("content_token") or "")
            content_type = str(body.get("contentType") or body.get("content_type") or "pin")
            content = str(body.get("content") or "").strip()
            if not content_token or not content:
                self.send_json(400, {"error": "BAD_COMMENT_PAYLOAD"})
                return
            try:
                upstream = create_community_comment(content_token, content_type, content)
                status, response = apply_content_event(
                    {
                        "eventId": f"community_{content_type}_{content_token}_comment_{int(time.time() * 1000)}",
                        "contentId": f"community_{content_token}",
                        "contentType": "pin" if content_type == "pin" else "comment",
                        "actionType": "comment",
                        "occurredAt": now_text(),
                    },
                    session["user_id"],
                )
                self.send_json(200, {
                    "ok": True,
                    "commentId": (upstream.get("data") or {}).get("comment_id"),
                    "reward": response.get("reward") if status == 200 else None,
                    "profile": response.get("profile") if status == 200 else None,
                })
            except Exception as error:
                status = 409 if str(error) == "COMMUNITY_CONFIG_MISSING" else 502
                self.send_json(status, {"error": "COMMUNITY_COMMENT_FAILED", "message": str(error)})
            return

        if path == "/api/p1/community/publish":
            session = self.require_auth_json()
            if session is None:
                return
            title = str(body.get("title") or "").strip()
            content = str(body.get("content") or "").strip()
            image_urls = body.get("imageUrls") or body.get("image_urls") or []
            if not content:
                self.send_json(400, {"error": "COMMUNITY_CONTENT_REQUIRED"})
                return
            try:
                upstream = publish_community_pin(title, content, image_urls if isinstance(image_urls, list) else [])
                self.send_json(200, {"ok": True, "contentToken": (upstream.get("data") or {}).get("content_token")})
            except Exception as error:
                status = 409 if str(error) == "COMMUNITY_CONFIG_MISSING" else 502
                self.send_json(status, {"error": "COMMUNITY_PUBLISH_FAILED", "message": str(error)})
            return

        if path == "/api/p1/community/leaderboard-share":
            session = self.require_auth_json()
            if session is None:
                return
            project_url = normalize_zhihu_web_url(body.get("projectUrl") or body.get("project_url") or "")
            user_id = session["user_id"]
            with connect_db() as conn:
                profile_row = fetch_profile(conn, user_id)
                if profile_row is None or not profile_row["adopted"]:
                    self.send_json(409, {"error": "PET_NOT_ADOPTED", "message": "请先领养刘看山"})
                    return
                shared_today = leaderboard_share_today(conn, user_id)
                if shared_today is not None:
                    self.send_json(429, {
                        "error": "LEADERBOARD_SHARE_DAILY_LIMIT",
                        "message": "今天已经分享过看山奖励啦，明天再来继续分享",
                        "sharedAt": shared_today["created_at"],
                    })
                    return
                user = fetch_user(conn, user_id)
                profile_payload = camel_profile(profile_row, user_id, fetch_level_visual(conn, profile_row["level"]))
                rank_item = leaderboard_payload(conn, user_id, "pet_level", 100).get("currentUserItem")
            title, content = leaderboard_share_copy(user, profile_payload, rank_item, project_url)
            image_urls = leaderboard_share_image_urls(profile_payload, project_url)
            try:
                upstream = publish_community_pin(title, content, image_urls)
            except Exception as error:
                status = 409 if str(error) == "COMMUNITY_CONFIG_MISSING" else 502
                self.send_json(status, {"error": "COMMUNITY_PUBLISH_FAILED", "message": str(error)})
                return
            with connect_db() as conn:
                conn.execute("BEGIN")
                status, reward_payload = grant_leaderboard_share_reward(conn, user_id)
                if status != 200:
                    conn.rollback()
                    self.send_json(status, reward_payload)
                    return
                conn.commit()
            self.send_json(200, {
                "ok": True,
                "ringName": "黑客松脑洞补给站",
                "contentToken": (upstream.get("data") or {}).get("content_token"),
                "title": title,
                "content": content,
                "imageUrls": image_urls,
                **reward_payload,
            })
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
    print("─" * 60)
    print(f"[liukanshan-demo] auth_mode={AUTH_MODE}, "
          f"local_auth_bypass={LOCAL_AUTH_BYPASS}")
    print(f"[liukanshan-demo] llm_model={LLM_MODEL}, "
          f"llm_demo_fallback={LLM_DEMO_FALLBACK}, "
          f"api_key={'present' if LLM_API_KEY else 'MISSING'}")
    print(f"[liukanshan-demo] decay_speedup={DECAY_SPEEDUP}, "
          f"travel_speedup={TRAVEL_SPEEDUP}")
    print(f"[liukanshan-demo] db={DB_PATH}")
    print("─" * 60)
    host = os.environ.get("HOST") or "127.0.0.1"
    port = int(os.environ.get("PORT") or 5173)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"P0 mock server running at http://{host}:{port}")
    print(f"推荐页: http://{host}:{port}/")
    print(f"关注页: http://{host}:{port}/follow")
    print(f"热榜页: http://{host}:{port}/hot")
    print(f"圈子页: http://{host}:{port}/community")
    print(f"个人页: http://{host}:{port}/people/p2wcex")
    server.serve_forever()
