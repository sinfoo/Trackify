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
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

log = logging.getLogger(__name__)

DEFAULT_MODELS = {"anthropic": "claude-opus-5-5", "openai": "gpt-5"}


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
        raise LLMUnavailable("rate limited") from e
    except anthropic.APIStatusError as e:
        raise LLMUnavailable(f"status {e.status_code}") from e
    if resp.stop_reason == "refusal":
        raise LLMUnavailable("refusal")
    text = "".join(b.text for b in resp.content if b.type == "text")
    return LLMResult(text, "anthropic", resp.model, resp.usage.input_tokens, resp.usage.output_tokens)


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
    if provider == "anthropic":
        return _anthropic(system, messages, model, max_tokens)
    return _openai(system, messages, model, max_tokens, temperature)


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
