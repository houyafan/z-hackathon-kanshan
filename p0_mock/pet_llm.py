"""Pet LLM abstraction layer.

Three responsibilities:
- chat_json: synchronous JSON completion (旅行手札 / 关注动态总结)
- chat_stream: SSE-friendly text stream (评论辅助)
- run_async: daemon-thread fire-and-forget for background work

All file I/O for prompts is read once and cached. Prompt files live in prompts/<name>.md
(system message only); user payload is passed in by the caller and JSON-dumped before send.
"""
import json
import threading
import time
from pathlib import Path
from typing import Callable, Iterator, List
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class LLMError(Exception):
    pass


class PetLLM:
    _DEMO_FALLBACKS = {
        "travel_handbook": {
            "summary": "我这趟出去看到大家都在聊学习方法和 AI 上手成本，主人最近也在看类似话题，挑了三条带回来。",
            "pet_quote": "重点不是赶上每一波，而是有低成本的入口。",
            "highlights": [
                {"title": "AI 红利从来不只是技术者的", "reason": "讲清了普通人怎么进入"},
                {"title": "高效阅读的三层笔记", "reason": "讲出了从读到用的转化"},
                {"title": "怎么挑值得跟进的新方向", "reason": "看山觉得这条最值得点开"},
            ],
        },
        "follow_moment_each": {
            "summary": "你关注的人最近发了一条值得点开的内容。",
        },
        "follow_moment_overview": {
            "overview": "你关注的几位最近都在聊学习方法和 AI 入门门槛，看山觉得有共鸣。",
        },
        "comment_assist": {
            "summary": "看山觉得这题最有意思的是「错过」其实更多是缺一个低成本理解的入口。",
        },
    }

    def _demo_fallback_json(self, prompt_name):
        return self._DEMO_FALLBACKS.get(prompt_name, {})

    def __init__(self, *, api_url: str, api_key: str, model: str,
                 prompts_dir: Path, timeout_sec: float = 8.0,
                 demo_fallback: bool = False):
        self.api_url = api_url
        self.api_key = api_key
        self.model = model
        self.prompts_dir = Path(prompts_dir)
        self.timeout_sec = timeout_sec
        self.demo_fallback = demo_fallback
        self._prompt_cache: dict[str, str] = {}

    def _load_prompt(self, name: str) -> str:
        if name in self._prompt_cache:
            return self._prompt_cache[name]
        path = self.prompts_dir / f"{name}.md"
        if not path.exists():
            raise LLMError(f"prompt file not found: {path}")
        text = path.read_text(encoding="utf-8")
        self._prompt_cache[name] = text
        return text

    def _prompt_version(self, name: str) -> str:
        text = self._load_prompt(name)
        for line in text.splitlines():
            if line.startswith("# version:"):
                return line.split(":", 1)[1].strip()
        return "unversioned"

    def model_tag(self, prompt_name: str) -> str:
        """Compose `{model}@{prompt_version}` for log fields."""
        return f"{self.model}@{self._prompt_version(prompt_name)}"

    def chat_json(self, prompt_name: str, payload: dict, *,
                  expected_keys: List[str], max_tokens: int = 400,
                  temperature: float = 0.6) -> dict:
        if self.demo_fallback:
            return self._demo_fallback_json(prompt_name)
        if not self.api_key:
            raise LLMError("LLM_API_KEY missing")
        system_prompt = self._load_prompt(prompt_name)
        body = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            "stream": False,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }, ensure_ascii=False).encode("utf-8")
        request = Request(self.api_url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        })
        raw = None
        for attempt in range(2):
            try:
                with urlopen(request, timeout=self.timeout_sec) as response:
                    raw = response.read()
                break
            except (URLError, HTTPError, TimeoutError, OSError) as error:
                if attempt == 0:
                    # network/5xx: retry once after 500ms
                    time.sleep(0.5)
                    continue
                raise LLMError(f"llm http error: {error}") from error
        try:
            envelope = json.loads(raw.decode("utf-8"))
            content = envelope["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as error:
            raise LLMError(f"llm bad envelope: {error}") from error
        try:
            result = json.loads(content)
        except ValueError as error:
            raise LLMError(f"llm content not json: {content[:120]}") from error
        if not isinstance(result, dict):
            raise LLMError(f"llm content not dict: {type(result).__name__}")
        for key in expected_keys:
            if key not in result:
                raise LLMError(f"llm missing key: {key}")
        return result

    def chat_stream(self, prompt_name: str, payload: dict, *,
                    max_chars: int = 100, max_tokens: int = 200,
                    temperature: float = 0.7) -> Iterator[str]:
        if self.demo_fallback:
            text = self._DEMO_FALLBACKS.get(prompt_name, {}).get("summary",
                "看山想了一下，主人这段话挺有共鸣，但具体看法可以你自己来一句。")
            text = text[:max_chars]
            for ch in text:
                time.sleep(0.04)
                yield ch
            return
        if not self.api_key:
            raise LLMError("LLM_API_KEY missing")
        system_prompt = self._load_prompt(prompt_name)
        body = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            "stream": True,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }, ensure_ascii=False).encode("utf-8")
        request = Request(self.api_url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "text/event-stream",
        })
        emitted = 0
        try:
            with urlopen(request, timeout=self.timeout_sec) as response:
                buffer = b""
                while True:
                    chunk = response.read(1024)
                    if not chunk:
                        break
                    buffer += chunk
                    while b"\n\n" in buffer:
                        event, buffer = buffer.split(b"\n\n", 1)
                        for line in event.split(b"\n"):
                            line = line.rstrip(b"\r")  # tolerate CRLF
                            if not line.startswith(b"data:"):
                                continue
                            payload_text = line[5:].strip()
                            if payload_text == b"[DONE]":
                                return
                            try:
                                evt = json.loads(payload_text.decode("utf-8"))
                            except ValueError:
                                continue
                            choices = evt.get("choices") or []
                            if not choices:
                                continue
                            delta = choices[0].get("delta") or {}
                            piece = delta.get("content")
                            if not piece:
                                continue
                            remaining = max_chars - emitted
                            if remaining <= 0:
                                return
                            if len(piece) > remaining:
                                piece = piece[:remaining]
                            emitted += len(piece)
                            yield piece
                            if emitted >= max_chars:
                                return
        except Exception as error:
            # SSE mid-stream may fail many ways (KeyError, UnicodeDecodeError,
            # IncompleteRead, etc.) — if any chunk emitted, prefer partial text
            # over hard error so caller's UI can keep what it already showed.
            if emitted == 0:
                raise LLMError(f"llm stream error: {error}") from error
            return

    def run_async(self, name: str, fn: Callable[[], None]) -> None:
        def _runner():
            try:
                fn()
            except Exception as error:
                print(f"[pet-llm] async task {name!r} failed: {error}", flush=True)
        thread = threading.Thread(target=_runner, name=f"pet-llm:{name}", daemon=True)
        thread.start()
