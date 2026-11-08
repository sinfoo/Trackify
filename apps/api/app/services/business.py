"""The business profile behind the public site. One row, seeded with fictional defaults."""

from sqlalchemy.orm import Session

from app.models import BusinessProfile

DEFAULT = {
    "name": "Trackify",
    "legal_name": "Trackify SARL",
    "tagline": "Practical AI, data and security programs taught by practitioners.",
    "about": "Trackify is a Tunis-based training company. Every program is built and taught by people who ship AI, "
    "data and security systems for a living. Sales, payments and analytics are run by the Trackify agent team; "
    "a human reviews anything risky.",
    "founded": "2021",
    "city": "Tunis, Tunisia",
    "address": "14 Rue du Lac L\u00e9man, Les Berges du Lac, 1053 Tunis",
    "phone": "+216 71 960 420",
    "email": "hello@trackify.tn",
    "support_email": "support@trackify.tn",
    "website": "trackify.tn",
    "registration": "RNE B01234562021",
    "tax_id": "1745210/A/M/000",
    "refund_policy": "Full refund within 14 days of enrollment, or before the second session, whichever comes first. "
    "Refunds are decided by a human on the finance team.",
    "learners": "1,240",
    "instructors": "18",
    "rating": "4.8",
    "accreditations": ["Ministry of Vocational Training (licence 2021/0471)", "ISO 29993 learning services"],
    "support_hours": "Monday to Friday, 9:00 to 18:00",
}

FIELDS = tuple(DEFAULT)


def get(db: Session) -> BusinessProfile:
    row = db.get(BusinessProfile, 1)
    if not row:
        row = BusinessProfile(id=1, **DEFAULT)
        db.add(row)
        db.flush()
    return row


def out(row: BusinessProfile) -> dict:
    return {k: getattr(row, k) for k in FIELDS} | {"updated_at": row.updated_at.isoformat() if row.updated_at else None}
