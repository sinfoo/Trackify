"""Voice Sales Agent. Deterministic sales playbook; LLM (if configured) rewrites the reply wording.

Structured facts (recommended product, CTA, prices) always come from the catalog and rules,
never from model text.
"""

import uuid

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
    "payment_concerns": "Checkout in this demo is fully simulated, no real card data is ever requested, and "
                        "refunds go through a human approval process.",
    "product_relevance": "Thanks for being clear. Tell me your goal and I will point you to a better-matched "
                         "offer, or none at all.",
}


def _fmt(p: Product) -> dict:
    return {"name": p.name, "price": f"{p.price:,.0f}", "cur": p.currency, "weeks": p.duration_weeks,
            "level": p.level.lower(), "outcomes": "; ".join(p.learning_outcomes[:3])}


def card(p: Product) -> dict:
    return {"id": str(p.id), "slug": p.slug, "name": p.name, "price": str(p.price), "currency": p.currency,
            "duration_weeks": p.duration_weeks, "level": p.level}


def playbook(history: list[Message], latest: str, products: list[Product], conv: Conversation) -> tuple[str, dict, SalesInteraction]:
    """Returns (reply_text, customer_safe_meta, structured_result)."""
    customer_texts = [m.content for m in history if m.role == "customer" and not m.flagged] + [latest]
    all_matches = ci.match_products(" ".join(customer_texts), products)
    now_matches = ci.match_products(latest, products)
    focus = (now_matches or all_matches or [(None, 0)])[0][0]
    objections = ci.detect_objections(latest)
    low = latest.lower()
    meta: dict = {}

    if ci.rejection_signal(latest):
        intent, action = "reject", "close_lost"
        reply = "Understood, thank you for your time. If your plans change, the catalogue stays open and I am here."
    elif ci.purchase_signal(latest) and (focus or all_matches):
        p = focus or all_matches[0][0]
        intent, action = "purchase", "prepare_enrollment"
        reply = (f"Excellent choice. I can reserve your seat in {p.name} ({_fmt(p)['price']} {p.currency}, "
                 f"{p.duration_weeks} weeks). Use the Enroll button to open the simulated checkout. "
                 "Our security agent checks every payment before it goes through.")
        meta = {"products": [card(p)], "cta": {"type": "enroll", "product_id": str(p.id), "label": f"Enroll in {p.name}"}}
        focus = p
    elif ci.purchase_signal(latest):
        intent, action = "purchase", "continue_conversation"
        reply = "Happy to enroll you. Which programme interests you? Here are our current offers."
        meta = {"products": [card(p) for p in products[:4]]}
    elif objections and (focus or all_matches):
        p = focus or all_matches[0][0]
        intent, action = "objection", "handle_objection"
        reply = OBJECTION_REPLIES[objections[0]].format(**_fmt(p))
        meta = {"products": [card(p)]}
        focus = p
    elif objections:
        intent, action = "objection", "handle_objection"
        reply = OBJECTION_REPLIES.get(objections[0], "").format(name="each programme", price="from 690", cur="TND",
                                                                 weeks="6 to 12", level="beginner to advanced",
                                                                 outcomes="hands-on projects")
        reply += " Which topic are you considering?"
    elif focus:
        intent, action = "question", "continue_conversation"
        f = _fmt(focus)
        reply = (f"{focus.name}: {focus.summary} It runs {f['weeks']} weeks ({f['level']}) for {f['price']} "
                 f"{focus.currency}. You will learn to {f['outcomes'].lower()}. Would you like to enroll or see "
                 "the syllabus?")
        meta = {"products": [card(focus)], "cta": {"type": "enroll", "product_id": str(focus.id),
                                                   "label": f"Enroll in {focus.name}"}}
    elif any(w in low for w in ("price", "cost", "offers", "courses", "catalog", "what do you", "programs", "programmes")):
        intent, action = "browse", "continue_conversation"
        lines = ", ".join(f"{p.name} ({_fmt(p)['price']} {p.currency})" for p in products[:6])
        reply = f"Our current programmes: {lines}. What is your goal, a career switch or upskilling?"
        meta = {"products": [card(p) for p in products[:6]]}
    elif len(customer_texts) <= 1 and any(w in low for w in ("hi", "hello", "bonjour", "salut", "hey")):
        intent, action = "greeting", "continue_conversation"
        reply = ("Hello! I help you find the right AI or tech training. Are you looking to change career, upskill "
                 "at work, or build a project?")
    else:
        intent, action = "browse", "continue_conversation"
        reply = ("Tell me a bit about your background and goal (for example: data, AI, security, web development) "
                 "and I will recommend the best fit.")
        meta = {"products": [card(p) for p in products[:3]]}

    sent = ci.sentiment(" ".join(customer_texts))
    level = "high" if intent == "purchase" else "medium" if (focus or all_matches) and intent != "reject" else "low"
    result = SalesInteraction(
        customer_id=conv.customer_id, session_id=conv.id,
        interaction_summary=f"{intent} turn{' about ' + focus.name if focus else ''}; sentiment {sent:+.2f}",
        intent=intent, interest_level=level, recommended_product_id=focus.id if focus else None,
        objections=objections, next_action=action,
        confidence=round(min(0.95, 0.5 + 0.15 * bool(focus) + 0.2 * (intent in ("purchase", "reject"))), 2),
    )
    return reply, meta, result


def run(ctx: AgentContext, payload: dict) -> tuple[str, dict]:
    db = ctx.db
    conv = ctx.use("conversation.read", db.get, Conversation, uuid.UUID(payload["conversation_id"]))
    products = ctx.use("catalog.read", lambda: list(db.scalars(
        select(Product).where(Product.status == ProductStatus.ACTIVE).order_by(Product.price))))
    latest = payload["message"]
    history = [m for m in conv.messages if m.id != uuid.UUID(payload["message_id"])] if payload.get("message_id") else list(conv.messages)
    reply, meta, result = playbook(history, latest, products, conv)

    cfg = ctx.config
    try:
        catalog = "\n".join(f"- {p.name}: {p.price} {p.currency}, {p.duration_weeks} weeks, {p.level}. {p.summary}"
                            for p in products)
        transcript = "\n".join(f"{m.role}: {m.content}" for m in history[-8:] if not m.flagged)
        res = llm.complete(
            f"{ctx_spec_prompt()}\n\nCATALOG:\n{catalog}\n\nA rules engine drafted this reply; improve wording only, "
            f"keep every fact and the call to action:\nDRAFT: {reply}",
            [{"role": "user", "content": llm.wrap_untrusted("conversation", f"{transcript}\ncustomer: {latest}")}],
            provider=cfg.provider, model=cfg.model, temperature=cfg.temperature, max_tokens=400)
        if res.text.strip():
            reply = res.text.strip()[:1200]
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
