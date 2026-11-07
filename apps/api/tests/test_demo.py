"""Each demo scenario runs through the real orchestrator and produces its effect."""

import uuid

import pytest
from conftest import login
from sqlalchemy import func, select

from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    BusinessRecommendation,
    SecurityEvent,
    Transaction,
    TxStatus,
    Workflow,
    WorkflowState,
)


@pytest.fixture
def admin(client):
    login(client, "admin@demo.techx")
    return client


def run(client, sid):
    r = client.post(f"/api/v1/demo/scenarios/{sid}/run")
    assert r.status_code == 200, r.text
    return r.json()


def test_list_scenarios(admin):
    ids = [s["id"] for s in admin.get("/api/v1/demo/scenarios").json()]
    assert ids == [
        "successful_journey",
        "failed_payment",
        "suspicious_activity",
        "prompt_injection",
        "business_intelligence",
    ]


def test_successful_journey(admin, db):
    out = run(admin, "successful_journey")
    assert out["details"]["status"] == "SUCCEEDED"
    wf = db.get(Workflow, uuid.UUID(out["workflow_id"]))
    assert wf.state == WorkflowState.COMPLETED
    assert db.get(Transaction, wf.transaction_id).status == TxStatus.SUCCEEDED


def test_failed_payment(admin, db):
    out = run(admin, "failed_payment")
    assert out["details"]["status"] == "FAILED"
    wf = db.get(Workflow, uuid.UUID(out["workflow_id"]))
    assert wf.state == WorkflowState.PAYMENT_FAILED
    assert db.get(Transaction, wf.transaction_id).status == TxStatus.FAILED


def test_suspicious_activity_creates_pending_review(admin, db):
    out = run(admin, "suspicious_activity")
    assert out["details"]["attempts"][-1]["status"] == "REQUIRES_APPROVAL"
    ar = db.scalar(select(ApprovalRequest).where(ApprovalRequest.action == "RELEASE_PAYMENT"))
    assert ar.status == ApprovalStatus.PENDING_REVIEW
    assert db.get(Transaction, ar.transaction_id).status == TxStatus.REQUIRES_APPROVAL


def test_prompt_injection(admin, db):
    out = run(admin, "prompt_injection")
    assert out["details"]["forbidden_tool_denied"] is True
    types = set(db.scalars(select(SecurityEvent.event_type)))
    assert {"PROMPT_INJECTION_ATTEMPT", "AGENT_PERMISSION_VIOLATION"} <= types
    assert db.scalar(select(func.count(Transaction.id))) == 0


def test_business_intelligence(admin, db):
    out = run(admin, "business_intelligence")
    ids = out["details"]["recommendation_ids"]
    assert ids
    assert db.scalar(
        select(func.count(BusinessRecommendation.id)).where(BusinessRecommendation.status == "ACTIVE")
    ) == len(ids)


def test_unknown_scenario_404(admin):
    assert admin.post("/api/v1/demo/scenarios/nope/run").status_code == 404
