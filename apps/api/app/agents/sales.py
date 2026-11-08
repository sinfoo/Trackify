"""Voice Sales Agent. Deterministic sales playbook; LLM (if configured) rewrites the reply wording.

Structured facts (recommended product, CTA, prices) always come from the catalog and rules,
never from model text.
"""

import re
import uuid
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field
from sqlalchemy import select

from app.agents import intelligence as ci
from app.agents.base import AgentContext
from app.llm import providers as llm
from app.models import Conversation, Message, Product, ProductStatus


class SalesInteraction(BaseModel):
    customer_id: uuid.UUID
    session_id: uuid.UUID
    interaction_summary: str
    intent: str  # browse | question | objection | purchase | reject | greeting
    interest_level: str  # low | medium | high
    recommended_product_id: uuid.UUID | None = None
    objections: list[str] = []
    next_action: str  # continue_conversation | handle_objection | prepare_enrollment | close_lost
    confidence: float = Field(ge=0, le=1)  # heuristic estimate, not a verified fact


OBJECTION_REPLIES = {
    "price": "I understand budget matters. {name} is {price} {cur}, and the demo academy offers a 3-instalment "
    "plan at no extra cost. Most learners see it as an investment in a better-paid role.",
    "time_constraints": "{name} runs {weeks} weeks with evening and weekend sessions, about 6 hours a week, "
    "and every session is recorded so you can catch up.",
    "trust": "Fair question. Instructors are practitioners, each cohort is capped, and you receive a verifiable "
    "certificate. I can share the syllabus before you decide.",
    "missing_information": "Here is what {name} covers: {outcomes}. Level: {level}. Anything specific you want "
    "to check?",
    "technical_difficulty": "No worries. {name} is {level} level; we start from fundamentals and mentors run "
    "weekly office hours.",
    "payment_concerns": "Yes: {name} ({price} {cur}) can be paid in 3 instalments at no extra cost. Checkout in "
    "this demo is simulated, no real card data is ever requested, and refunds go through a human approval process.",
    "product_relevance": "Thanks for being clear. Tell me your goal and I will point you to a better-matched "
    "offer, or none at all.",
}


def _fmt(p: Product) -> dict:
    return {
        "name": p.name,
        "price": f"{p.price:,.0f}",
        "cur": p.currency,
        "weeks": p.duration_weeks,
        "level": p.level.lower(),
        "outcomes": "; ".join(p.learning_outcomes[:3]),
    }


def card(p: Product) -> dict:
    return {
        "id": str(p.id),
        "slug": p.slug,
        "name": p.name,
        "price": str(p.price),
        "currency": p.currency,
        "duration_weeks": p.duration_weeks,
        "level": p.level,
    }


# Profile -> program, used when the customer describes themselves instead of naming a program.
# Order matters: non-technical profiles first so "marketing, never coded" never lands on an advanced course.
PROFILE_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        "ai-leadership",
        ("manager", "executive", "ceo", "founder", "lead a team", "leadership", "my company", "director"),
    ),
    (
        "intro-ai",
        (
            "never coded",
            "no coding",
            "not technical",
            "non-technical",
            "no experience",
            "new to ai",
            "marketing",
            "beginner",
            "complete beginner",
            "sales job",
            "teacher",
            "student",
        ),
    ),
    (
        "data-science",
        ("excel", "data analyst", "analytics", "reports", "dashboard", "statistics", "business intelligence"),
    ),
    ("cybersecurity", ("security", "network", "sysadmin", "it support", "hacking", "firewall")),
    ("fullstack", ("website", "web app", "frontend", "backend", "javascript", "react")),
    ("advanced-ml", ("data scientist", "ml engineer", "kaggle", "deep learning")),
    ("genai-llm", ("developer", "programmer", "software engineer", "python", "chatbot", "llm", "automate")),
]
RECOMMEND_ASK = (
    "recommend",
    "which course",
    "which program",
    "what should i",
    "suggest",
    "best for me",
    "fit me",
    "good fit",
    "where should i start",
    "what do you advise",
)
BROWSE_ASK = ("offers", "courses", "catalog", "programs", "programmes", "what do you offer", "what do you have")


def recommend_for(text: str, products: list[Product]) -> Product | None:
    t = text.lower()
    by_slug = {p.slug: p for p in products}
    for slug, cues in PROFILE_RULES:
        if slug in by_slug and any(c in t for c in cues):
            return by_slug[slug]
    return None


def playbook(
    history: list[Message],
    latest: str,
    products: list[Product],
    conv: Conversation,
    enrolled: frozenset[str] = frozenset(),
) -> tuple[str, dict, SalesInteraction]:
    """Returns (reply_text, customer_safe_meta, structured_result)."""
    customer_texts = [m.content for m in history if m.role == "customer" and not m.flagged] + [latest]
    all_matches = ci.match_products(" ".join(customer_texts), products)
    now_matches = ci.match_products(latest, products)
    by_id = {str(p.id): p for p in products}
    # Last program pitched on its own (one card): what "it" / "enroll me" refers to.
    last_pitched = next(
        (
            by_id.get(m.meta["products"][0]["id"])
            for m in reversed(history)
            if m.role == "agent" and len((m.meta or {}).get("products") or []) == 1
        ),
        None,
    )
    profile = recommend_for(" ".join(customer_texts), products)
    focus = (
        now_matches[0][0] if now_matches else last_pitched or (all_matches[0][0] if all_matches else None) or profile
    )
    objections = ci.detect_objections(latest)
    low = latest.lower()
    meta: dict = {}
    # Don't re-pitch: products already shown in the last agent replies get no new card / button.
    recent = [m for m in history if m.role == "agent"][-3:]
    shown = {c["id"] for m in recent for c in (m.meta or {}).get("products", [])}
    offered = {(m.meta or {}).get("cta", {}).get("product_id") for m in recent}

    def pitch(p: Product, with_cta: bool = True) -> dict:
        pid = str(p.id)
        out: dict = {} if pid in shown else {"products": [card(p)]}
        if with_cta and pid not in offered and pid not in enrolled:
            out["cta"] = {"type": "enroll", "product_id": pid, "label": f"Enroll in {p.name}"}
        return out

    if ci.rejection_signal(latest):
        intent, action = "reject", "close_lost"
        reply = "Understood, thank you for your time. If your plans change, the catalogue stays open and I am here."
    elif ci.purchase_signal(latest) and (focus or all_matches) and str((focus or all_matches[0][0]).id) in enrolled:
        p = focus or all_matches[0][0]
        intent, action = "purchase", "continue_conversation"
        reply = (
            f"Good news: you are already enrolled in {p.name}, and your onboarding details are on their way. "
            "Would you like to look at another program to continue your learning path?"
        )
        focus = p
    elif ci.purchase_signal(latest) and (focus or all_matches):
        p = focus or all_matches[0][0]
        intent, action = "purchase", "prepare_enrollment"
        reply = (
            f"Excellent choice. I can reserve your seat in {p.name} ({_fmt(p)['price']} {p.currency}, "
            f"{p.duration_weeks} weeks). Use the Enroll button to open the simulated checkout. "
            "Our security agent checks every payment before it goes through."
        )
        meta = {
            "products": [card(p)],
            "cta": {"type": "enroll", "product_id": str(p.id), "label": f"Enroll in {p.name}"},
        }
        focus = p
    elif ci.purchase_signal(latest):
        intent, action = "purchase", "continue_conversation"
        reply = "Happy to enroll you. Which programme interests you? Here are our current offers."
        meta = {"products": [card(p) for p in products[:4]]}
    elif not now_matches and any(w in low for w in BROWSE_ASK):
        intent, action = "browse", "continue_conversation"
        lines = ", ".join(f"{p.name} ({_fmt(p)['price']} {p.currency})" for p in products[:7])
        reply = f"Our current programmes: {lines}. What is your goal, a career switch or upskilling?"
        meta = {"products": [card(p) for p in products[:7]]}
    elif any(w in low for w in RECOMMEND_ASK) and (profile or focus):
        p = now_matches[0][0] if now_matches else (profile or focus)
        intent, action = "question", "continue_conversation"
        f = _fmt(p)
        reply = (
            f"Based on what you told me, I recommend {p.name}. {p.summary} It runs {f['weeks']} weeks "
            f"({f['level']}) for {f['price']} {p.currency} and is designed for: {p.target_audience.lower()} "
            "Would you like to enroll?"
        )
        meta = pitch(p)
        focus = p
    elif objections and (focus or all_matches):
        p = focus or all_matches[0][0]
        intent, action = "objection", "handle_objection"
        reply = OBJECTION_REPLIES[objections[0]].format(**_fmt(p))
        meta = pitch(p, with_cta=False)
        focus = p
    elif objections:
        intent, action = "objection", "handle_objection"
        reply = OBJECTION_REPLIES.get(objections[0], "").format(
            name="each programme",
            price="from 690",
            cur="TND",
            weeks="6 to 12",
            level="beginner to advanced",
            outcomes="hands-on projects",
        )
        reply += " Which topic are you considering?"
    elif focus and not now_matches and "?" not in latest:
        intent, action = "question", "continue_conversation"
        reply = (
            f"Happy to help. Anything else you would like to know about {focus.name}, such as the schedule, "
            "prerequisites or the payment plan? When you are ready, I can reserve your seat."
        )
    elif focus:
        intent, action = "question", "continue_conversation"
        f = _fmt(focus)
        reply = (
            f"{focus.name}: {focus.summary} It runs {f['weeks']} weeks ({f['level']}) for {f['price']} "
            f"{focus.currency}. You will learn to {f['outcomes'].lower()}. Would you like to enroll or see "
            "the syllabus?"
        )
        meta = pitch(focus) if now_matches else {}
    elif len(customer_texts) <= 1 and re.search(r"(hi|hello|bonjour|salut|hey)", low):
        intent, action = "greeting", "continue_conversation"
        reply = (
            "Hello! I help you find the right AI or tech training. Are you looking to change career, upskill "
            "at work, or build a project?"
        )
    else:
        intent, action = "browse", "continue_conversation"
        reply = (
            "Tell me a bit about your background and goal (for example: data, AI, security, web development) "
            "and I will recommend the best fit."
        )

    sent = ci.sentiment(" ".join(customer_texts))
    level = "high" if intent == "purchase" else "medium" if (focus or all_matches) and intent != "reject" else "low"
    result = SalesInteraction(
        customer_id=conv.customer_id,
        session_id=conv.id,
        interaction_summary=f"{intent} turn{' about ' + focus.name if focus else ''}; sentiment {sent:+.2f}",
        intent=intent,
        interest_level=level,
        recommended_product_id=focus.id if focus else None,
        objections=objections,
        next_action=action,
        confidence=round(min(0.95, 0.5 + 0.15 * bool(focus) + 0.2 * (intent in ("purchase", "reject"))), 2),
    )
    return reply, meta, result


def run(ctx: AgentContext, payload: dict) -> tuple[str, dict]:
    db = ctx.db
    conv = ctx.use("conversation.read", db.get, Conversation, uuid.UUID(payload["conversation_id"]))
    products = ctx.use(
        "catalog.read",
        lambda: list(db.scalars(select(Product).where(Product.status == ProductStatus.ACTIVE).order_by(Product.price))),
    )
    latest = payload["message"]
    history = (
        [m for m in conv.messages if m.id != uuid.UUID(payload["message_id"])]
        if payload.get("message_id")
        else list(conv.messages)
    )
    from app.orchestration.orchestrator import enrolled_product_ids  # local: orchestrator imports agents

    enrolled = frozenset(str(i) for i in enrolled_product_ids(db, conv.customer_id))
    reply, meta, result = playbook(history, latest, products, conv, enrolled)

    cfg = ctx.config
    try:
        catalog = "\n".join(
            f"- {p.name}: {p.price:.0f} {p.currency}, {p.duration_weeks} weeks, level {p.level}. {p.summary} "
            f"Outcomes: {'; '.join(p.learning_outcomes)}. For: {p.target_audience}"
            for p in products
        )
        transcript = "\n".join(f"{m.role}: {m.content}" for m in history[-8:] if not m.flagged)
        res = llm.complete(
            f"{ctx_spec_prompt()}\n\nCATALOG:\n{catalog}\n\nPOLICIES: 3-instalment plan at no extra cost; evening and "
            "weekend sessions, about 6 hours a week, all recorded; mentors run weekly office hours; verifiable "
            "certificate; checkout is simulated and refunds need human approval.\n\n"
            "Answer the customer's latest message directly (questions, doubts, objections), using only CATALOG and "
            "POLICIES. If the DRAFT recommends a program, recommend that same program and no other. Do not repeat facts "
            "you already gave earlier in the conversation unless asked. If the DRAFT mentions the Enroll button, tell "
            "the customer to use the Enroll button below instead of asking a question. Otherwise end with one short "
            "next-step question. Never copy the DRAFT sentence by sentence. "
            f"Plain text, max 60 words.\nDRAFT: {reply}",
            [{"role": "user", "content": llm.wrap_untrusted("conversation", f"{transcript}\ncustomer: {latest}")}],
            provider=cfg.provider,
            model=cfg.model,
            temperature=cfg.temperature,
            max_tokens=400,
        )
        text = res.text.strip()[:1200]
        if text and safe_reply(text, products):
            reply = text
            ctx.provider, ctx.tokens_in, ctx.tokens_out = res.provider, res.tokens_in, res.tokens_out
    except llm.LLMUnavailable:
        pass

    def _reply():
        m = Message(conversation_id=conv.id, role="agent", content=reply, meta=meta)
        db.add(m)
        db.flush()
        return m

    msg = ctx.use("conversation.reply", _reply)
    out = result.model_dump(mode="json") | {"reply_message_id": str(msg.id)}
    return f"{result.intent} → {result.next_action} ({result.interest_level} interest)", out


def ctx_spec_prompt() -> str:
    from app.agents.base import SPECS

    return SPECS["sales"].system_prompt


_AMOUNT = re.compile(r"(\d[\d,\s]*(?:\.\d+)?)\s*(?:TND|DT|dinars?)", re.I)
_FORBIDDEN = re.compile(
    r"\b(discount|coupon|promo code|for free|free of charge|\d+\s*% off|refund (is|has been) (approved|issued)|"
    r"payment (is|has been) (approved|confirmed))\b",
    re.I,
)


def safe_reply(text: str, products: list[Product]) -> bool:
    """Output validation: model text may not invent prices or promise discounts/approvals."""
    prices = {p.price.quantize(Decimal("1")) for p in products}
    for raw in _AMOUNT.findall(text):
        try:
            amount = Decimal(raw.replace(",", "").replace(" ", "")).quantize(Decimal("1"))
        except InvalidOperation:
            return False
        if amount not in prices:
            return False
    return not _FORBIDDEN.search(text)
