"""Customer Intelligence Agent: rules-based NLP, optionally refined by an LLM."""

import re
import unicodedata
import uuid

from pydantic import BaseModel, Field
from sqlalchemy import select

from app.agents.base import AgentContext
from app.llm import providers as llm
from app.models import Conversation, Customer, CustomerInsight, Product, ProductStatus

OBJECTION_TERMS: dict[str, list[str]] = {
    "price": ["expensive", "price", "cost", "cheaper", "discount", "afford", "budget", "too much", "cher", "prix"],
    "time_constraints": [
        "no time",
        "busy",
        "schedule",
        "too long",
        "weeks is",
        "evening",
        "weekend",
        "pas le temps",
        "horaire",
        "emploi du temps",
        "trop long",
    ],
    "trust": [
        "legit",
        "trust",
        "scam",
        "reviews",
        "accredited",
        "recognized",
        "guarantee",
        "who teaches",
        "certificat reconnu",
        "fiable",
        "avis",
    ],
    "missing_information": [
        "syllabus",
        "prerequisite",
        "more details",
        "what exactly",
        "how does it work",
        "curriculum",
        "programme detaille",
        "prerequis",
        "plus de details",
    ],
    "product_relevance": ["not relevant", "don't need", "not for me", "already know", "not useful"],
    "technical_difficulty": [
        "too hard",
        "difficult",
        "no experience",
        "math",
        "too advanced",
        "beginner",
        "never coded",
        "difficile",
        "jamais code",
        "pas d'experience",
        "debutant",
    ],
    "payment_concerns": [
        "installment",
        "payment plan",
        "pay later",
        "secure payment",
        "refund",
        "pay in",
        "en plusieurs fois",
        "facilites de paiement",
        "paiement securise",
        "tranches",
    ],
}
POSITIVE = [
    "great",
    "good",
    "love",
    "perfect",
    "excellent",
    "interested",
    "awesome",
    "nice",
    "thanks",
    "helpful",
    "sounds good",
    "exactly",
    "cool",
    "super",
    "merci",
    "parfait",
    "happy",
    "genial",
    "super interessant",
    "top",
    "bien",
]
NEGATIVE = [
    "bad",
    "expensive",
    "worried",
    "confusing",
    "not sure",
    "hate",
    "disappointed",
    "annoying",
    "scam",
    "difficult",
    "problem",
    "no thanks",
    "unfortunately",
    "frustrated",
    "decu",
    "trop cher",
    "inquiet",
    "pas sur",
]
PURCHASE = [
    "enroll",
    "enrol",
    "sign me up",
    "sign up",
    "register",
    "buy",
    "purchase",
    "i'll take",
    "i will take",
    "book a seat",
    "reserve",
    "let's do it",
    "ready to pay",
    "join the",
    "m'inscrire",
    "inscription",
    "je m'inscris",
    "je veux m'inscrire",
    "acheter",
    "je prends",
    "reserver ma place",
]
INTEREST = [
    "interested",
    "tell me more",
    "sounds good",
    "i like",
    "how much",
    "when does",
    "what will i learn",
    "looking for",
    "i want to learn",
    "career",
    "want to become",
    "interesse",
    "je cherche",
    "j'aimerais apprendre",
    "je voudrais apprendre",
    "reconversion",
]
REJECT = [
    "not interested",
    "no thanks",
    "maybe later",
    "not now",
    "too expensive for me",
    "i'll pass",
    "goodbye",
    "pas interesse",
    "non merci",
    "plus tard",
]
NEEDS = {
    "career_change": ["career", "new job", "switch", "become a", "job market"],
    "upskilling": ["improve", "upskill", "promotion", "at work", "my team", "current job"],
    "certification": ["certificate", "certification", "diploma", "accredited"],
    "build_projects": ["project", "portfolio", "build", "startup", "product"],
    "flexibility": ["online", "remote", "evening", "weekend", "self-paced", "flexible"],
}
MOTIVATIONS = {
    "salary_growth": ["salary", "pay more", "earn"],
    "curiosity": ["curious", "fascinated", "interested in"],
    "employability": ["job", "hired", "employer", "recruit"],
    "entrepreneurship": ["startup", "my business", "freelance", "own company"],
}


def _hits(text: str, terms: list[str]) -> int:
    return sum(1 for t in terms if t in text)


def _norm(text: str) -> str:
    """Lowercase, collapse spaces, strip accents (so "cybersécurité" matches "cybersecurite")."""
    t = unicodedata.normalize("NFKD", text.lower())
    return re.sub(r"\s+", " ", "".join(c for c in t if not unicodedata.combining(c)))


def match_products(text: str, products: list[Product]) -> list[tuple[Product, int]]:
    t = _norm(text)
    scored = []
    for p in products:
        score = sum(2 if _norm(kw) in t else 0 for kw in p.keywords)
        score += 3 if _norm(p.name) in t else 0
        if score:
            scored.append((p, score))
    return sorted(scored, key=lambda x: -x[1])


def detect_objections(text: str) -> list[str]:
    t = _norm(text)
    return [k for k, terms in OBJECTION_TERMS.items() if _hits(t, terms)]


def sentiment(text: str) -> float:
    t = _norm(text)
    pos, neg = _hits(t, POSITIVE), _hits(t, NEGATIVE)
    if pos + neg == 0:
        return 0.0
    return round((pos - neg) / (pos + neg), 2)


def purchase_signal(text: str) -> bool:
    return _hits(_norm(text), PURCHASE) > 0


def rejection_signal(text: str) -> bool:
    return _hits(_norm(text), REJECT) > 0


class InsightModel(BaseModel):
    summary: str
    needs: list[str] = []
    motivations: list[str] = []
    interests: list[str] = []
    preferred_product_ids: list[str] = []
    objections: list[str] = []
    satisfaction_signals: list[str] = []
    sentiment_score: float = Field(ge=-1, le=1)
    sentiment_label: str
    purchase_intent: float = Field(ge=0, le=1)
    hesitation: bool
    journey_stage: str
    recommended_follow_up: str
    confidence: float = Field(ge=0, le=1)


class LLMInsight(BaseModel):
    summary: str = Field(max_length=400)
    needs: list[str] = Field(default=[], max_length=6)
    motivations: list[str] = Field(default=[], max_length=6)
    recommended_follow_up: str = Field(max_length=300)


FOLLOW_UPS = {
    "price": "Send the payment-plan option and a short ROI note (salary outcomes).",
    "time_constraints": "Share the weekly schedule and the evening/weekend cohort option.",
    "trust": "Share instructor bios, alumni reviews and the certificate sample.",
    "missing_information": "Send the detailed syllabus and prerequisites.",
    "technical_difficulty": "Offer the beginner track and a free placement quiz.",
    "payment_concerns": "Explain the sandbox-secured checkout and refund policy.",
    "product_relevance": "Ask about goals and suggest a better-matched offer.",
}


def analyze(customer_texts: list[str], products: list[Product], converted: bool = False) -> InsightModel:
    full = " ".join(customer_texts)
    t = _norm(full)
    objections = detect_objections(full)
    sent = sentiment(full)
    matched = match_products(full, products)
    interests = sorted({p.category for p, _ in matched})
    purchase = purchase_signal(full)
    reject = rejection_signal(customer_texts[-1]) if customer_texts else False
    interest_hits = _hits(t, INTEREST)
    intent = 0.15 + (0.45 if purchase else 0) + min(0.3, 0.1 * interest_hits) + (0.1 if matched else 0)
    intent += 0.1 * sent - 0.07 * len(objections) - (0.45 if reject else 0)
    intent = 1.0 if converted else round(min(1.0, max(0.0, intent)), 2)
    hesitation = bool(objections) and not purchase
    if converted:
        stage = "PURCHASED"
    elif reject:
        stage = "LOST"
    elif purchase:
        stage = "INTENT"
    elif matched or interest_hits:
        stage = "CONSIDERATION"
    else:
        stage = "AWARENESS"
    label = "positive" if sent > 0.2 else "negative" if sent < -0.2 else "neutral"
    sat = [w for w in POSITIVE if w in t][:5]
    top = matched[0][0].name if matched else "an offer"
    summary = (
        f"{len(customer_texts)} customer message(s). Interested in {', '.join(interests) or 'general AI training'}"
        f"{' (' + top + ')' if matched else ''}. "
        f"{'Objections: ' + ', '.join(objections) + '. ' if objections else ''}"
        f"Intent {intent:.2f}, sentiment {label}."
    )
    follow = (FOLLOW_UPS.get(objections[0]) if objections else None) or (
        "Send the enrollment link."
        if purchase and not converted
        else "Send onboarding details."
        if converted
        else f"Recommend {top} with a short success story."
    )
    evidence = len(customer_texts) + len(objections) + interest_hits + (2 if purchase else 0)
    return InsightModel(
        summary=summary,
        needs=[k for k, v in NEEDS.items() if _hits(t, v)],
        motivations=[k for k, v in MOTIVATIONS.items() if _hits(t, v)],
        interests=interests,
        preferred_product_ids=[str(p.id) for p, _ in matched[:2]],
        objections=objections,
        satisfaction_signals=sat,
        sentiment_score=sent,
        sentiment_label=label,
        purchase_intent=intent,
        hesitation=hesitation,
        journey_stage=stage,
        recommended_follow_up=follow,
        confidence=round(min(0.9, 0.35 + 0.08 * evidence), 2),
    )


def run(ctx: AgentContext, payload: dict) -> tuple[str, dict]:
    db = ctx.db
    conv = ctx.use("conversation.read", db.get, Conversation, uuid.UUID(payload["conversation_id"]))
    products = ctx.use(
        "catalog.read", lambda: list(db.scalars(select(Product).where(Product.status == ProductStatus.ACTIVE)))
    )
    texts = [m.content for m in conv.messages if m.role == "customer" and not m.flagged]
    insight = analyze(texts, products, converted=payload.get("converted", False))

    cfg = ctx.config
    try:
        transcript = "\n".join(f"{m.role}: {m.content}" for m in conv.messages if not m.flagged)[-6000:]
        refined, res = llm.complete_json(
            "Summarise this sales conversation for a CRM. Be factual and short.",
            llm.wrap_untrusted("conversation", transcript),
            LLMInsight,
            provider=cfg.provider,
            model=cfg.model,
            temperature=cfg.temperature,
        )
        insight.summary, insight.recommended_follow_up = refined.summary, refined.recommended_follow_up
        insight.needs = sorted(set(insight.needs) | {n[:40] for n in refined.needs})
        insight.motivations = sorted(set(insight.motivations) | {m[:40] for m in refined.motivations})
        ctx.provider, ctx.tokens_in, ctx.tokens_out = res.provider, res.tokens_in, res.tokens_out
    except llm.LLMUnavailable:
        pass

    def _write():
        row = db.scalar(select(CustomerInsight).where(CustomerInsight.conversation_id == conv.id))
        if not row:
            row = CustomerInsight(customer_id=conv.customer_id, conversation_id=conv.id, **insight.model_dump())
            db.add(row)
        else:
            for k, v in insight.model_dump().items():
                setattr(row, k, v)
        row.source = ctx.provider if ctx.provider != "rules" else "rules"
        conv.summary = insight.summary
        cust = db.get(Customer, conv.customer_id)
        if cust.journey_stage != "CUSTOMER":
            cust.journey_stage = insight.journey_stage
        db.flush()
        return row

    ctx.use("insight.write", _write)
    out = insight.model_dump()
    return (
        f"intent {insight.purchase_intent:.2f} · {insight.sentiment_label} · "
        f"objections: {', '.join(insight.objections) or 'none'}"
    ), out
