from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require
from app.db.base import get_db
from app.models import User
from app.services import audit, business, payments

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
            "gemini_configured": bool(s.gemini_api_key),
        },
        "payments": payments.settings_view(),
        "voice": {"stt": "browser", "tts": "browser"},
        "environment": s.app_env,
    }


class BusinessProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    legal_name: str = Field("", max_length=120)
    tagline: str = Field("", max_length=200)
    about: str = Field("", max_length=4000)
    founded: str = Field("", max_length=10)
    city: str = Field("", max_length=80)
    address: str = Field("", max_length=200)
    phone: str = Field("", max_length=40)
    email: str = Field("", max_length=120)
    support_email: str = Field("", max_length=120)
    website: str = Field("", max_length=120)
    registration: str = Field("", max_length=60)
    tax_id: str = Field("", max_length=60)
    refund_policy: str = Field("", max_length=4000)
    learners: str = Field("", max_length=20)
    instructors: str = Field("", max_length=20)
    rating: str = Field("", max_length=10)
    accreditations: list[str] = Field(default_factory=list, max_length=10)
    support_hours: str = Field("", max_length=120)


@router.get("/settings/business-profile")
def get_business_profile(db: Session = Depends(get_db), _: User = Depends(require("settings:read"))):
    row = business.get(db)
    db.commit()
    return business.out(row)


@router.put("/settings/business-profile")
def put_business_profile(
    body: BusinessProfileIn, db: Session = Depends(get_db), user: User = Depends(require("settings:write"))
):
    row = business.get(db)
    changed = {k: v for k, v in body.model_dump().items() if getattr(row, k) != v}
    for k, v in changed.items():
        setattr(row, k, v)
    if changed:
        audit.record(
            db,
            actor_type="user",
            actor_id=user.email,
            action="business_profile.updated",
            resource_type="business_profile",
            resource_id="1",
            details={"fields": sorted(changed)},
        )
    db.commit()
    return business.out(row)
