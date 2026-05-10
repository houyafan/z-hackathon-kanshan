"""PetLLM abstraction layer tests. Uses unittest (stdlib only) + urlopen patching."""
import json
import sys
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pet_llm import PetLLM, LLMError  # noqa: E402


class FakeResponse:
    def __init__(self, body):
        self._buf = BytesIO(body if isinstance(body, bytes) else body.encode("utf-8"))

    def read(self, size=-1):
        if size is None or size < 0:
            return self._buf.read()
        return self._buf.read(size)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class TestChatJson(unittest.TestCase):
    def setUp(self):
        prompts_dir = Path(__file__).resolve().parents[1] / "prompts"
        self.llm = PetLLM(
            api_url="https://example.invalid/chat",
            api_key="test-key",
            model="ep-test",
            prompts_dir=prompts_dir,
            timeout_sec=5,
        )

    def test_chat_json_renders_prompt_and_parses_envelope(self):
        envelope = {
            "choices": [
                {"message": {"content": json.dumps({"summary": "ok", "pet_quote": "hi"})}}
            ]
        }
        with patch("pet_llm.urlopen", return_value=FakeResponse(json.dumps(envelope))):
            result = self.llm.chat_json(
                "travel_handbook",
                {"travel_theme": "polar", "materials": []},
                expected_keys=["summary", "pet_quote"],
            )
        self.assertEqual(result["summary"], "ok")
        self.assertEqual(result["pet_quote"], "hi")

    def test_chat_json_missing_expected_key_raises(self):
        envelope = {"choices": [{"message": {"content": json.dumps({"summary": "ok"})}}]}
        with patch("pet_llm.urlopen", return_value=FakeResponse(json.dumps(envelope))):
            with self.assertRaises(LLMError):
                self.llm.chat_json(
                    "travel_handbook",
                    {"travel_theme": "polar"},
                    expected_keys=["summary", "pet_quote"],
                )

    def test_chat_json_no_api_key_raises(self):
        llm = PetLLM(
            api_url="https://example.invalid/chat",
            api_key="",
            model="ep-test",
            prompts_dir=Path(__file__).resolve().parents[1] / "prompts",
            timeout_sec=5,
        )
        with self.assertRaises(LLMError):
            llm.chat_json("travel_handbook", {}, expected_keys=["summary"])


class TestChatStream(unittest.TestCase):
    def setUp(self):
        prompts_dir = Path(__file__).resolve().parents[1] / "prompts"
        self.llm = PetLLM(
            api_url="https://example.invalid/chat",
            api_key="test-key",
            model="ep-test",
            prompts_dir=prompts_dir,
            timeout_sec=5,
        )

    def test_chat_stream_yields_concatenated_chunks(self):
        sse_body = (
            b'data: {"choices":[{"delta":{"content":"\xe7\x9c\x8b"}}]}\n\n'
            b'data: {"choices":[{"delta":{"content":"\xe5\xb1\xb1"}}]}\n\n'
            b'data: [DONE]\n\n'
        )
        with patch("pet_llm.urlopen", return_value=FakeResponse(sse_body)):
            chunks = list(self.llm.chat_stream(
                "travel_handbook", {"travel_theme": "polar"}, max_chars=50))
        self.assertEqual("".join(chunks), "看山")

    def test_chat_stream_truncates_at_max_chars(self):
        sse_body = (
            b'data: {"choices":[{"delta":{"content":"\xe4\xb8\x80\xe4\xba\x8c\xe4\xb8\x89\xe5\x9b\x9b\xe4\xba\x94"}}]}\n\n'
            b'data: [DONE]\n\n'
        )
        with patch("pet_llm.urlopen", return_value=FakeResponse(sse_body)):
            chunks = list(self.llm.chat_stream(
                "travel_handbook", {"travel_theme": "polar"}, max_chars=3))
        self.assertEqual("".join(chunks), "一二三")


import time as _time

class TestRunAsync(unittest.TestCase):
    def setUp(self):
        self.llm = PetLLM(
            api_url="https://example.invalid/chat",
            api_key="test",
            model="ep-test",
            prompts_dir=Path(__file__).resolve().parents[1] / "prompts",
        )

    def test_run_async_executes_callback_in_daemon_thread(self):
        result = []
        self.llm.run_async("test", lambda: result.append("ok"))
        for _ in range(50):
            if result:
                break
            _time.sleep(0.02)
        self.assertEqual(result, ["ok"])

    def test_run_async_swallows_exception(self):
        captured = []
        def boom():
            raise RuntimeError("intentional")
        self.llm.run_async("test", boom)
        _time.sleep(0.1)
        captured.append("survived")
        self.assertEqual(captured, ["survived"])


if __name__ == "__main__":
    unittest.main()
