"""Hackathon OAuth integration safety checks."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "p0_mock"))


class TestOAuthConfig(unittest.TestCase):
    def test_config_contains_public_oauth_values_but_no_app_key(self):
        text = (ROOT / "p0_mock" / "config.json").read_text(encoding="utf-8")
        config = json.loads(text)
        self.assertTrue(config["zhihu_oauth_enabled"])
        self.assertRegex(config["zhihu_oauth_app_id"], r"^\d+$")
        redirect_uri = config["zhihu_oauth_redirect_uri"]
        self.assertTrue(redirect_uri.startswith("https://"))
        self.assertTrue(redirect_uri.endswith("/auth/callback"))
        self.assertNotRegex(text, r"zhihu_oauth_app_key|zhihu_app_key|access_token|authorization_code")

    def test_five_oauth_user_interfaces_are_declared(self):
        from server import ZHIHU_OAUTH_USER_INTERFACES

        self.assertEqual(len(ZHIHU_OAUTH_USER_INTERFACES), 5)
        self.assertEqual(
            {item["id"] for item in ZHIHU_OAUTH_USER_INTERFACES},
            {"contents", "followees", "favlists", "favlist_contents", "collections"},
        )


if __name__ == "__main__":
    unittest.main()
