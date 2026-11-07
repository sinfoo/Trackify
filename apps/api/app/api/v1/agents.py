import uuid

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.base import FORBIDDEN_TOOLS, SPECS
from app.api.v1.common import Page, agent_out, execution_out, workflow_out
from app.core.deps import current_user, require
from app.core.errors import AppError, not_found
from app.db.base import get_db
from app.models import Agent, AgentExecution, AgentMessage, ApprovalRequest, SystemEvent, User, Workflow, WorkflowState
from app.orchestration import orchestrator
from app.services import analytics, audit, events

router = APIRouter(tags=["agents"])


def _stats(db: Session) -> dict[str, dict]:
    return {s["agent_id"]: s for s in analytics.agents(db, analytics.Filters())}


@router.get("/agents")
def list_agents(db: Session = Depends(get_db), _: User = Depends(require("agents:read"))):
    stats = _stats(db)
    return [agent_out(a, stats.get(a.id)) for a in db.scalars(select(Agent).order_by(Agent.id)) if a.id in SPECS]


def _agent(db: Session, agent_id: str) -> Agent:
    a = db.get(Agent, agent_id)
    if not a or a.id not in SPECS:
        raise not_found("Agent")
    return a


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str, db: Session = Depends(get_db), _: User = Depends(require("agents:read"))):
    return agent_out(_agent(db, agent_id), _stats(db).get(agent_id)) | {"system_prompt": SPECS[agent_id].system_prompt}


@router.get("/agents/{agent_id}/executions")
def agent_executions(
    agent_id: str,
    page: Page = Depends(),
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("agents:read")),
):
    _agent(db, agent_id)
    q = select(AgentExecution).where(AgentExecution.agent_id == agent_id).order_by(AgentExecution.started_at.desc())
    if status:
        q = q.where(AgentExecution.status == status)
    return page.apply(db, q, execution_out)


@router.get("/agents/{agent_id}/permissions")
def agent_permissions(agent_id: str, db: Session = Depends(get_db), _: User = Depends(require("agents:read"))):
    _agent(db, agent_id)
    other = set().union(*(s.tools for s in SPECS.values())) - SPECS[agent_id].tools
    return {"allowed_tools": sorted(SPECS[agent_id].tools), "forbidden_tools": sorted(FORBIDDEN_TOOLS | other)}


class AgentConfigIn(BaseModel):
    enabled: bool | None = None
    provider: str | None = Field(None, pattern="^(mock|anthropic|openai)$")
    model: str | None = Field(None, max_length=80)
    temperature: float | None = Field(None, ge=0, le=1)


@router.patch("/agents/{agent_id}/config")
def config(
    agent_id: str, body: AgentConfigIn, db: Session = Depends(get_db), user: User = Depends(require("agents:write"))
):
    a = _agent(db, agent_id)
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(a, k, v)
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="agent.config_changed",
        resource_type="agent",
        resource_id=agent_id,
        severity="WARN",
        details=changes,
    )
    db.commit()
    return agent_out(a, _stats(db).get(agent_id))


class ExecuteIn(BaseModel):
    task_type: str = Field(max_length=60)
    payload: dict = {}


# Manually runnable tasks. Payment processing is deliberately excluded: it only runs inside a workflow.
MANUAL_TASKS = {
    ("analyst", "update_metrics"): lambda p: {"trigger": "manual"},
    ("strategy", "generate_recommendations"): lambda p: {},
    ("intelligence", "analyze_conversation"): lambda p: {"conversation_id": str(uuid.UUID(str(p["conversation_id"])))},
    ("security", "screen_message"): lambda p: {"task": "screen_message", "text": str(p["text"])[:2000]},
    ("security", "explain"): lambda p: {
        "task": "explain",
        "security_event_id": str(uuid.UUID(str(p["security_event_id"]))),
    },
}


@router.post("/agents/{agent_id}/execute")
def execute(
    agent_id: str,
    body: ExecuteIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    # Security analysts may ask the security agent to explain an alert; everything else needs agents:write.
    perm = "security:write" if (agent_id, body.task_type) == ("security", "explain") else "agents:write"
    require(perm)(request, user, db)
    _agent(db, agent_id)
    build = MANUAL_TASKS.get((agent_id, body.task_type))
    if not build:
        raise AppError(
            422,
            "TASK_NOT_ALLOWED",
            f"Task '{body.task_type}' cannot be run manually on '{agent_id}'",
            {"allowed": [t for (a, t) in MANUAL_TASKS if a == agent_id]},
        )
    try:
        payload = build(body.payload)
    except (KeyError, ValueError) as e:
        raise AppError(422, "INVALID_PAYLOAD", f"Invalid payload: {e}") from e
    try:
        orchestrator.execute(
            db,
            agent_id,
            payload,
            wf=None,
            task_type=body.task_type,
            triggered_by=f"user:{user.email}",
            input_summary="manual run",
        )
    except AppError:
        db.commit()
        raise
    db.commit()
    ex = db.scalar(
        select(AgentExecution)
        .where(AgentExecution.agent_id == agent_id)
        .order_by(AgentExecution.started_at.desc())
        .limit(1)
    )
    return execution_out(ex)


# ---------------------------------------------------------------- workflows


@router.get("/workflows")
def list_workflows(
    page: Page = Depends(),
    state: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("workflows:read")),
):
    q = select(Workflow).order_by(Workflow.updated_at.desc())
    if state:
        q = q.where(Workflow.state == state)
    return page.apply(db, q, lambda w: workflow_out(w, db))


@router.get("/workflows/{wf_id}")
def get_workflow(wf_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("workflows:read"))):
    w = db.get(Workflow, wf_id)
    if not w:
        raise not_found("Workflow")
    from app.api.v1.common import approval_out, iso

    execs = db.scalars(
        select(AgentExecution).where(AgentExecution.workflow_id == w.id).order_by(AgentExecution.started_at)
    )
    msgs = db.scalars(select(AgentMessage).where(AgentMessage.workflow_id == w.id).order_by(AgentMessage.created_at))
    aps = (
        db.scalars(select(ApprovalRequest).where(ApprovalRequest.transaction_id == w.transaction_id))
        if w.transaction_id
        else []
    )
    return workflow_out(w, db) | {
        "steps": [
            {
                "id": str(s.id),
                "from_state": s.from_state,
                "to_state": s.to_state,
                "agent_id": s.agent_id,
                "note": s.note,
                "created_at": iso(s.created_at),
            }
            for s in w.steps
        ],
        "executions": [execution_out(e) for e in execs],
        "messages": [
            {
                "id": str(m.id),
                "from_agent": m.from_agent,
                "to_agent": m.to_agent,
                "message_type": m.message_type,
                "payload": m.payload,
                "created_at": iso(m.created_at),
            }
            for m in msgs
        ],
        "approvals": [approval_out(a, db) for a in aps],
    }


@router.post("/workflows/{wf_id}/cancel")
def cancel_workflow(wf_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require("workflows:write"))):
    w = db.get(Workflow, wf_id)
    if not w:
        raise not_found("Workflow")
    if w.state in (WorkflowState.COMPLETED, WorkflowState.CANCELLED, WorkflowState.BLOCKED):
        raise AppError(409, "WORKFLOW_FINISHED", f"Workflow is already {w.state}")
    orchestrator.move(db, w, WorkflowState.CANCELLED, None, f"cancelled by {user.email}")
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="workflow.cancelled",
        resource_type="workflow",
        resource_id=w.id,
        severity="WARN",
    )
    db.commit()
    return workflow_out(w, db)


@router.get("/workflows/{wf_id}/events")
def workflow_events(wf_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("workflows:read"))):
    rows = db.scalars(select(SystemEvent).where(SystemEvent.workflow_id == str(wf_id)).order_by(SystemEvent.id))
    return [events.serialize(e) for e in rows]


@router.get("/events")
def list_events(
    after_id: int = 0,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require("events:read")),
):
    q = (
        select(SystemEvent)
        .where(SystemEvent.id > after_id)
        .order_by(SystemEvent.id.desc() if not after_id else SystemEvent.id)
    )
    rows = list(db.scalars(q.limit(limit)))
    if not after_id:
        rows.reverse()
    perms = user.permission_codes
    return [events.serialize(e) for e in rows if e.required_permission in perms]
