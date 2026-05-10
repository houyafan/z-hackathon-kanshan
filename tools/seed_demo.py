#!/usr/bin/env python3
"""Demo data seed script.

Bumps the mock user's pet stats so evaluators can immediately:
- Trigger 出门游历 (satiety>=60, travel_energy>=10)
- See follow-moments LLM summaries (3 seed moments injected as ready)
- See decay/wake/leaderboard/daily quest sections populated

Run: `python3 tools/seed_demo.py`

Idempotent: safe to run multiple times. Pass --reset to clear demo data first.
"""
import argparse
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "sqlite" / "liukanshan_p0.sqlite"
DEFAULT_USER_ID = 10001
NOW = datetime.now().isoformat(timespec="seconds")


def now_text():
    return NOW


def ensure_user(conn):
    """Make sure mock user exists in zhihu_user."""
    conn.execute(
        """
        INSERT INTO zhihu_user (uid, fullname, headline, description, avatar_path, created_at, updated_at)
        VALUES (?, '看山七子', '让复杂讨论被看见结构', '刘看山虚拟宠物 demo 用户', '', ?, ?)
        ON CONFLICT(uid) DO UPDATE SET updated_at = excluded.updated_at
        """,
        (DEFAULT_USER_ID, now_text(), now_text()),
    )


def ensure_adopted(conn):
    """Make sure pet is adopted with healthy stats."""
    row = conn.execute(
        "SELECT user_id FROM pet_profile WHERE user_id = ?", (DEFAULT_USER_ID,),
    ).fetchone()
    if row is None:
        conn.execute(
            """
            INSERT INTO pet_profile
              (user_id, adopted, pet_name, level, stage, total_exp,
               satiety, mood, health, travel_energy, travel_status,
               last_growth_at, created_at, updated_at)
            VALUES (?, 1, '刘看山', 3, 'cub', 120, 80, 70, 100, 15, 'home', ?, ?, ?)
            """,
            (DEFAULT_USER_ID, now_text(), now_text(), now_text()),
        )
        print(f"[seed] created pet_profile for user {DEFAULT_USER_ID}")
    else:
        conn.execute(
            """
            UPDATE pet_profile SET
              adopted = 1,
              satiety = MAX(satiety, 80),
              mood = MAX(mood, 70),
              health = MAX(health, 100),
              travel_energy = MAX(travel_energy, 15),
              travel_status = 'home',
              wake_status = 'awake',
              wake_progress = 0,
              last_growth_at = ?,
              updated_at = ?
            WHERE user_id = ?
            """,
            (now_text(), now_text(), DEFAULT_USER_ID),
        )
        print(f"[seed] bumped pet_profile for user {DEFAULT_USER_ID}: satiety>=80, energy>=15, awake")


def ensure_seed_follow_moments(conn):
    """Inject 3 seed follow-moments with LLM summary already ready."""
    seeds = [
        {
            "moment_key": "demo-seed-k1",
            "actor_name": "青山布衣",
            "action_text": "回答了问题",
            "action_time": int((datetime.now() - timedelta(hours=1)).timestamp()),
            "target_title": "为什么 AI 红利让普通人犹豫？",
            "target_excerpt": "每一代人都会在时代机会面前犹豫，重要的是用低成本的方式去理解它。",
            "target_author_name": "知乎用户",
            "llm_summary": "青山布衣聊了一篇 AI 红利的回答，重点是普通人怎么低成本起步。",
        },
        {
            "moment_key": "demo-seed-k2",
            "actor_name": "看山七子",
            "action_text": "赞同了回答",
            "action_time": int((datetime.now() - timedelta(minutes=30)).timestamp()),
            "target_title": "高效阅读的三层笔记法",
            "target_excerpt": "从读到用的转化，关键在于把信息整理成可操作的清单。",
            "target_author_name": "知乎用户",
            "llm_summary": "看山七子推了一篇阅读方法的回答，主张做行动清单而不是流水笔记。",
        },
        {
            "moment_key": "demo-seed-k3",
            "actor_name": "路人甲",
            "action_text": "发表了文章",
            "action_time": int((datetime.now() - timedelta(minutes=15)).timestamp()),
            "target_title": "怎么挑值得跟进的新方向",
            "target_excerpt": "不是每一个新事物都值得追，关键是看是否有低成本进入和长期复利。",
            "target_author_name": "知乎用户",
            "llm_summary": "路人甲分享了选方向的思考，看山觉得「低成本进入 + 长期复利」这条值得回看。",
        },
    ]
    for s in seeds:
        conn.execute(
            """
            INSERT INTO zhihu_follow_moment
              (user_id, moment_key, actor_name, action_text, action_time,
               target_title, target_excerpt, target_author_name, raw_payload,
               llm_summary_status, llm_summary, llm_summary_model, llm_summary_updated_at,
               reward_granted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 'ready', ?, 'demo-seed', ?, 1, ?, ?)
            ON CONFLICT(user_id, moment_key) DO UPDATE SET
              llm_summary_status = excluded.llm_summary_status,
              llm_summary = excluded.llm_summary,
              llm_summary_updated_at = excluded.llm_summary_updated_at,
              updated_at = excluded.updated_at
            """,
            (DEFAULT_USER_ID, s["moment_key"], s["actor_name"], s["action_text"],
             s["action_time"], s["target_title"], s["target_excerpt"], s["target_author_name"],
             s["llm_summary"], now_text(), now_text(), now_text()),
        )
    print(f"[seed] inserted/refreshed {len(seeds)} demo follow-moments with LLM ready")


def reset(conn):
    print("[seed] --reset: clearing demo seeds")
    conn.execute(
        "DELETE FROM zhihu_follow_moment WHERE user_id = ? AND moment_key LIKE 'demo-seed-%'",
        (DEFAULT_USER_ID,),
    )
    conn.execute(
        "DELETE FROM pet_follow_moment_overview WHERE user_id = ? AND sync_batch_id LIKE 'demo-seed-%'",
        (DEFAULT_USER_ID,),
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true",
                        help="clear demo seeds before re-seeding")
    parser.add_argument("--no-moments", action="store_true",
                        help="skip follow-moment seeds")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"[seed] ERROR: db not found at {DB_PATH}. Run server.py once to init.")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        if args.reset:
            reset(conn)
        ensure_user(conn)
        ensure_adopted(conn)
        if not args.no_moments:
            ensure_seed_follow_moments(conn)
        conn.commit()
        print("[seed] done. Refresh browser at http://127.0.0.1:5173/")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
