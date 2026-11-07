from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.deps import require
from app.models import User
from app.services import payments

router = APIRouter(tags=["settings"])


@router.get("/settings")
def get_system_settings(_: User = Depends(require("settings:read"))):
    """Never returns keys: only whether each provider is configured."""
    s = get_settings()
    return {
        "ai": {
            "provider": s.ai_provider,
            "default_model": s.default_model,
            "anthropic_configured": bool(s.anthropic_api_key),
            "openai_configured": bool(s.openai_api_key),
        },
        "payments": payments.settings_view(),
        "voice": {"stt": "browser", "tts": "browser"},
        "environment": s.app_env,
    }
