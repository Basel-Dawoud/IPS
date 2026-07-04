"""Qwen inference via the Ollama HTTP API.

Ollama serves the same quantized Qwen2.5-3B GGUF but handles CPU feature
detection itself (runtime dispatch), so it runs on any x86-64 host without the
"illegal instruction" crashes that prebuilt llama-cpp-python wheels hit on CPUs
lacking AVX-512. In production this service and Ollama run as two containers in
one Coolify Docker-Compose resource (see docker-compose.yml), reaching Ollama
by service name at http://ollama:11434.

Local dev:
    ollama pull qwen2.5:3b        # Q4_K_M by default (~1.9 GB)
    ollama serve                  # usually already running as a service
"""
import json
import os
import re

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
LLM_MODEL = os.environ.get("CHATBOT_LLM_MODEL", "qwen2.5:3b")
_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT_S", "60"))


def _chat(messages, *, json_mode: bool, max_tokens: int) -> str:
    """Single non-streaming chat completion. Greedy decoding (temperature 0) to
    match the deterministic behaviour the reference relied on."""
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0, "num_predict": max_tokens},
    }
    if json_mode:
        payload["format"] = "json"
    resp = httpx.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return (data.get("message") or {}).get("content", "") or ""


def chat_json(system: str, user: str, max_tokens: int = 220) -> dict | None:
    """Ask the model for a single JSON object and parse it. Returns None if the
    output can't be parsed as JSON."""
    try:
        text = _chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            json_mode=True,
            max_tokens=max_tokens,
        )
    except Exception as e:  # noqa: BLE001 - network/daemon errors are non-fatal
        print(f"[llm] chat_json error: {e}")
        return None
    return _extract_json(text)


def chat_text(system: str, user: str, max_tokens: int = 160) -> str:
    """Free-form reply (chitchat / mall info)."""
    try:
        return _chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            json_mode=False,
            max_tokens=max_tokens,
        ).strip()
    except Exception as e:  # noqa: BLE001
        print(f"[llm] chat_text error: {e}")
        return ""


def _extract_json(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def model_available() -> bool:
    """True if the Ollama daemon is up and the model has been pulled."""
    try:
        resp = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        tags = resp.json().get("models", [])
        names = {m.get("name", "") for m in tags}
        # Ollama reports e.g. "qwen2.5:3b"; accept a prefix match on the base.
        base = LLM_MODEL.split(":")[0]
        return any(n == LLM_MODEL or n.startswith(base) for n in names)
    except Exception:
        return False
