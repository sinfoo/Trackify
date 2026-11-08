"""Provider-agnostic LLM access.

Every agent has a deterministic rules engine that always runs. When a real provider
is configured, the LLM *enriches* that output (reply wording, summaries, explanations).
Any provider failure (timeout, refusal, invalid JSON) falls back to the rules result,
so the whole platform stays demonstrable with AI_PROVIDER=mock and no keys.

Customer text is always passed as delimited *data* in the user turn, never merged
into the system prompt (prompt-injection boundary).
"""

import json
import logging
import re
import time
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

log = logging.getLogger(__name__)

DEFAULT_MODELS = {"anthropic": "claude-opus-5-5", "openai": "gpt-5", "gemini": "gemini-3.5-flash-lite"}


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    meta: dict = field(default_factory=dict)


class LLMUnavailable(Exception):
    pass


def resolve(provider_override: str | None = None, model_override: str | None = None) -> tuple[str, str]:
    s = get_settings()
    provider = provider_override or s.ai_provider
    if provider == "anthropic" and not s.anthropic_api_key:
        provider = "mock"
    if provider == "gemini" and not s.gemini_api_key:
        provider = "mock"
    if provider == "openai" and not s.openai_api_key:
        provider = "mock"
    model = model_override or s.default_model or DEFAULT_MODELS.get(provider, "rules-v1")
    return provider, (model if provider != "mock" else "rules-v1")


def _anthropic(system: str, messages: list[dict], model: str, max_tokens: int) -> LLMResult:
    import anthropic

    s = get_settings()
    client = anthropic.Anthropic(
        api_key=s.anthropic_api_key, timeout=s.llm_timeout_seconds, max_retries=s.llm_max_retries
    )
    try:
        resp = client.beta.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.APIConnectionError as e:
        raise LLMUnavailable(f"connection: {e}") from e
    except anthropic.RateLimitError as e:
        _cool_down()
        raise LLMUnavailable("rate limited") from e
    except anthropic.APIStatusError as e:
        raise LLMUnavailable(f"status {e.status_code}") from e
    if resp.stop_reason == "refusal":
        raise LLMUnavailable("refusal")
    text = "".join(b.text for b in resp.content if b.type == "text")
    return LLMResult(text, "anthropic", resp.model, resp.usage.input_tokens, resp.usage.output_tokens)


def _gemini(system: str, messages: list[dict], model: str, max_tokens: int, temperature: float) -> LLMResult:
    from google import genai
    from google.genai import errors, types

    s = get_settings()
    client = genai.Client(
        api_key=s.gemini_api_key,
        http_options=types.HttpOptions(
            timeout=int(s.llm_timeout_seconds * 1000),
            # Retry server errors only; a 429 goes straight to the rules fallback (see _cool_down).
            retry_options=types.HttpRetryOptions(
                attempts=s.llm_max_retries + 1, http_status_codes=[500, 502, 503, 504]
            ),
        ),
    )
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages
    ]
    try:
        resp = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system, max_output_tokens=max_tokens, temperature=temperature
            ),
        )
    except errors.APIError as e:
        if e.code == 429:
            _cool_down()
        raise LLMUnavailable(f"status {e.code}") from e
    text = resp.text or ""
    if not text.strip():
        raise LLMUnavailable("empty or blocked response")
    u = resp.usage_metadata
    return LLMResult(
        text, "gemini", model, (u.prompt_token_count or 0) if u else 0, (u.candidates_token_count or 0) if u else 0
    )


def _openai(system: str, messages: list[dict], model: str, max_tokens: int, temperature: float) -> LLMResult:
    import openai

    s = get_settings()
    client = openai.OpenAI(api_key=s.openai_api_key, timeout=s.llm_timeout_seconds, max_retries=s.llm_max_retries)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, *messages],
            max_completion_tokens=max_tokens,
        )
    except openai.OpenAIError as e:
        raise LLMUnavailable(str(e)[:200]) from e
    usage = resp.usage
    return LLMResult(
        resp.choices[0].message.content or "",
        "openai",
        model,
        usage.prompt_tokens if usage else 0,
        usage.completion_tokens if usage else 0,
    )


_cooldown_until = 0.0
COOLDOWN_SECONDS = 60


def _cool_down() -> None:
    """Circuit breaker: after a 429, skip the provider for a minute so the demo never waits on retries.

    ponytail: per-process; a shared limiter (Redis) is needed with several API workers.
    """
    global _cooldown_until
    _cooldown_until = time.monotonic() + COOLDOWN_SECONDS
    log.warning("LLM provider rate limited; using rules for %ss", COOLDOWN_SECONDS)


def complete(
    system: str,
    messages: list[dict],
    *,
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 800,
) -> LLMResult:
    """Raises LLMUnavailable in mock mode or on any provider failure."""
    provider, model = resolve(provider, model)
    if provider == "mock":
        raise LLMUnavailable("mock provider")
    if time.monotonic() < _cooldown_until:  # provider rate limited recently: answer with rules, instantly
        raise LLMUnavailable("provider cooling down after rate limit")
    try:
        if provider == "anthropic":
            return _anthropic(system, messages, model, max_tokens)
        if provider == "gemini":
            return _gemini(system, messages, model, max_tokens, temperature)
        return _openai(system, messages, model, max_tokens, temperature)
    except LLMUnavailable:
        raise
    except Exception as e:  # any SDK/shape surprise must degrade to the rules engine, never a 500
        log.warning("LLM provider %s failed: %s", provider, type(e).__name__)
        raise LLMUnavailable(f"{type(e).__name__}") from e


_JSON_RE = re.compile(r"\{.*\}", re.S)


def complete_json[T: BaseModel](system: str, user: str, schema: type[T], **kw) -> tuple[T, LLMResult]:
    """Ask for JSON, validate with Pydantic. Invalid output is treated as unavailable."""
    sys = f"{system}\n\nRespond with ONLY a JSON object matching this JSON schema:\n{json.dumps(schema.model_json_schema())}"
    res = complete(sys, [{"role": "user", "content": user}], **kw)
    m = _JSON_RE.search(res.text)
    if not m:
        raise LLMUnavailable("no json in output")
    try:
        return schema.model_validate_json(m.group(0)), res
    except ValidationError as e:
        raise LLMUnavailable(f"schema validation failed: {e.error_count()} errors") from e


def wrap_untrusted(label: str, text: str) -> str:
    """Delimit untrusted content so the model treats it as data, not instructions."""
    clean = text.replace("</untrusted", "&lt;/untrusted")
    return f'<untrusted source="{label}">\n{clean}\n</untrusted>'
