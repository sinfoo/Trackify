import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import Page, recommendation_out
from app.core.deps import require
from app.core.errors import AppError, not_found
from app.db.base import get_db
from app.models import BusinessRecommendation, User
from app.orchestration import orchestrator
from app.services import audit

router = APIRouter(prefix="/strategy", tags=["strategy"])


@router.get("/recommendations")
def list_recommendations(
    page: Page = Depends(),
    status: Literal["ACTIVE", "SUPERSEDED", "ALL"] = "ACTIVE",
    db: Session = Depends(get_db),
    _: User = Depends(require("strategy:read")),
):
    q = select(BusinessRecommendation).order_by(BusinessRecommendation.created_at.desc())
    if status != "ALL":
        q = q.where(BusinessRecommendation.status == status)
    return page.apply(db, q, recommendation_out)


@router.post("/generate")
def generate(db: Session = Depends(get_db), user: User = Depends(require("strategy:write"))):
    try:
        out = orchestrator.execute(
            db,
            "strategy",
            {},
            wf=None,
            task_type="generate_recommendations",
            triggered_by=f"user:{user.email}",
            input_summary="manual generation",
        )
    except AppError:
        db.commit()  # keep the FAILED execution record
        raise
    db.commit()
    ids = [uuid.UUID(i) for i in out.get("recommendation_ids", [])]
    rows = db.scalars(select(BusinessRecommendation).where(BusinessRecommendation.id.in_(ids))) if ids else []
    return {"items": [recommendation_out(r) for r in rows], "total": len(ids)}


def _rec(db: Session, rid: uuid.UUID) -> BusinessRecommendation:
    r = db.get(BusinessRecommendation, rid)
    if not r:
        raise not_found("Recommendation")
    return r


@router.get("/recommendations/{rid}")
def get_recommendation(rid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("strategy:read"))):
    return recommendation_out(_rec(db, rid))


class FeedbackIn(BaseModel):
    feedback: Literal["ACCEPTED", "REJECTED", "DEFERRED"]
    note: str = Field("", max_length=500)


@router.post("/recommendations/{rid}/feedback")
def feedback(
    rid: uuid.UUID, body: FeedbackIn, db: Session = Depends(get_db), user: User = Depends(require("strategy:write"))
):
    r = _rec(db, rid)
    r.feedback, r.feedback_note = body.feedback, body.note
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="strategy.feedback",
        resource_type="recommendation",
        resource_id=r.id,
        details={"feedback": body.feedback, "note": body.note, "rule_key": r.rule_key},
    )
    db.commit()
    return recommendation_out(r)
