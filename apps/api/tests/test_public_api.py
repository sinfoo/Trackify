"""Customer-facing API must not leak internals. Health endpoints."""

import uuid

import pytest
from conftest import product

P = "/api/v1/public"


def _start(client):
    r = client.post(f"{P}/conversations", json={"full_name": "Leak Check", "consent_voice": False, "channel": "text"})
    return r.json()["conversation_id"], {"X-Conversation-Token": r.json()["access_token"]}


def test_wrong_or_missing_token_is_404(client):
    conv_id, h = _start(client)
    assert client.get(f"{P}/conversations/{conv_id}", headers=h).status_code == 200
    assert client.get(f"{P}/conversations/{conv_id}", headers={"X-Conversation-Token": "x" * 43}).status_code == 404
    assert client.get(f"{P}/conversations/{conv_id}").status_code == 404
    assert client.get(f"{P}/conversations/{uuid.uuid4()}", headers=h).status_code == 404  # no enumeration
    r = client.post(
        f"{P}/conversations/{conv_id}/messages", json={"content": "hi"}, headers={"X-Conversation-Token": "wrong"}
    )
    assert r.status_code == 404


def test_message_meta_only_has_safe_keys(client):
    conv_id, h = _start(client)
    for text in ["I'm interested in machine learning", "Isn't it a bit expensive for me?", "OK, sign me up!"]:
        client.post(f"{P}/conversations/{conv_id}/messages", json={"content": text}, headers=h)
    msgs = client.get(f"{P}/conversations/{conv_id}", headers=h).json()["messages"]
    assert len(msgs) >= 7
    for m in msgs:
        assert set(m) == {"id", "role", "content", "created_at", "meta"}
        assert set(m["meta"]) <= {"products", "cta", "notice"}, m["meta"]


def test_checkout_is_simulated_and_has_no_risk_fields(client, db):
    conv_id, h = _start(client)
    pid = str(product(db, "intro-ai").id)
    db.rollback()
    sid = client.post(f"{P}/conversations/{conv_id}/enroll", json={"product_id": pid}, headers=h).json()[
        "checkout_session_id"
    ]
    body = client.get(f"{P}/checkout/{sid}").json()
    assert body["simulated"] is True and body["amount"] == "690.000" and body["currency"] == "TND"
    flat = repr(body).lower()
    for leak in ("risk", "flags", "security", "approval", "insight"):
        assert leak not in flat, leak
    assert {m["id"] for m in body["test_methods"]} >= {"sim_card_success", "sim_card_declined"}


def test_voice_requires_consent(client):
    r = client.post(f"{P}/conversations", json={"consent_voice": False, "channel": "voice"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "CONSENT_REQUIRED"


def test_offers_have_decimal_string_prices(client):
    offers = client.get(f"{P}/offers").json()
    assert len(offers) == 7
    assert {o["slug"]: o["price"] for o in offers}["ai-leadership"] == "2400.000"


@pytest.mark.parametrize("path", ["/api/v1/health", "/api/v1/health/live", "/api/v1/health/ready"])
def test_health(client, path):
    r = client.get(path)
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"
