"""R4 关注动态 LLM 总结：daemon worker 全链路."""
import json
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _seed_db(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE zhihu_follow_moment (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          moment_key TEXT NOT NULL,
          actor_name TEXT, action_text TEXT, action_time INTEGER,
          target_title TEXT, target_excerpt TEXT, target_author_name TEXT,
          raw_payload TEXT,
          llm_summary_status TEXT NOT NULL DEFAULT 'pending',
          llm_summary TEXT,
          llm_summary_model TEXT,
          llm_summary_updated_at TEXT,
          llm_retry_count INTEGER NOT NULL DEFAULT 0,
          llm_error TEXT,
          reward_granted INTEGER NOT NULL DEFAULT 0,
          notified_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE pet_follow_moment_overview (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          sync_batch_id TEXT NOT NULL,
          overview_text TEXT NOT NULL DEFAULT '',
          moment_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ready',
          model TEXT,
          consumed_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    return conn


class TestSummarizeFollowMoments(unittest.TestCase):
    def setUp(self):
        self.db_file = Path(__file__).resolve().parent / "_test_follow.db"
        if self.db_file.exists():
            self.db_file.unlink()
        self.conn = _seed_db(self.db_file)
        self.conn.executemany(
            "INSERT INTO zhihu_follow_moment "
            "(user_id, moment_key, actor_name, action_text, action_time, target_title, target_excerpt, target_author_name) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (1, "k1", "青山布衣", "回答了", 1, "AI 红利", "每一代人……", "知乎用户"),
                (1, "k2", "看山七子", "赞同了", 2, "学习方法", "高效阅读……", "知乎用户"),
            ],
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.db_file.unlink(missing_ok=True)

    def test_summarize_writes_each_summary_and_overview(self):
        from server import summarize_follow_moments
        call_count = [0]
        def fake_chat_json(prompt_name, payload, *, expected_keys, **kwargs):
            call_count[0] += 1
            if prompt_name == "follow_moment_each":
                return {"summary": f"看山看到了 {payload['actor_name']}"}
            if prompt_name == "follow_moment_overview":
                return {"overview": "看山扫了一眼，最近大家在聊学习和 AI"}
            raise AssertionError(f"unexpected prompt {prompt_name}")
        with patch("server.PET_LLM.chat_json", side_effect=fake_chat_json), \
             patch("server.connect_db", return_value=self.conn), \
             patch("server.PET_LLM.model_tag", return_value="ep-test@v1"):
            summarize_follow_moments(user_id=1, batch_id="batch-test", moment_ids=[1, 2])
        self.assertEqual(call_count[0], 3)  # 2 each + 1 overview
        rows = list(self.conn.execute("SELECT moment_key, llm_summary_status, llm_summary FROM zhihu_follow_moment ORDER BY id"))
        self.assertTrue(all(r["llm_summary_status"] == "ready" for r in rows))
        self.assertIn("青山布衣", rows[0]["llm_summary"])
        ov = self.conn.execute("SELECT * FROM pet_follow_moment_overview").fetchone()
        self.assertIsNotNone(ov)
        self.assertEqual(ov["status"], "ready")
        self.assertIn("学习", ov["overview_text"])


if __name__ == "__main__":
    unittest.main()
