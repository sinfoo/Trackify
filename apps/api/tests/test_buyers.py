"""Buyer accounts: library, guest-conversation linking, and the pay gate."""

from conftest import as_buyer, login, product

V = "/api/v1"


def _register_buyer(client, email="newbuyer@example.com", name="New Buyer"):
    r = client.post(f"{V}/auth/register", json={"email": email, "full_name": name, "password": "longenough1"})
    assert r.status_code == 201 and r.json()["roles"] == ["BUYER"], r.text
    return r.json()


def _guest_chat(client, text="Tell me about data science"):
    client.cookies.clear()
    r = client.post(f"{V}/public/conversations", json={"consent_voice": False, "channel": "text"})
    cid, tok = r.json()["conversation_id"], r.json()["access_token"]
    client.post(
        f"{V}/public/conversations/{cid}/messages", json={"content": text}, headers={"X-Conversation-Token": tok}
    )
    return cid, tok


def test_guest_cannot_enroll_without_buyer_account(client, db):
    cid, tok = _guest_chat(client)
    pid = str(product(db, "data-science").id)
    db.rollback()
    r = client.post(
        f"{V}/public/conversations/{cid}/enroll", json={"product_id": pid}, headers={"X-Conversation-Token": tok}
    )
    assert r.status_code == 401 and r.json()["error"]["code"] == "BUYER_ACCOUNT_REQUIRED"
    login(client, "viewer@demo.techx")  # a staff-only account cannot buy either
    r = client.post(
        f"{V}/public/conversations/{cid}/enroll", json={"product_id": pid}, headers={"X-Conversation-Token": tok}
    )
    assert r.status_code == 403


def test_enrolling_attaches_the_guest_conversation_and_fills_the_library(client, db):
    cid, tok = _guest_chat(client)
    _register_buyer(client)  # signed in by the register call
    pid = str(product(db, "data-science").id)
    db.rollback()
    h = {"X-Conversation-Token": tok}
    sid = client.post(f"{V}/public/conversations/{cid}/enroll", json={"product_id": pid}, headers=h).json()[
        "checkout_session_id"
    ]
    acc = client.get(f"{V}/me/account").json()
    assert acc["user"]["is_buyer"] and not acc["user"]["is_seller"]
    assert [p["slug"] for p in acc["recommended"]] == ["data-science"]  # the guest chat now belongs to the buyer
    assert acc["arriving"][0]["payment"]["checkout_open"] and acc["library"] == []
    r = client.post(
        f"{V}/public/checkout/{sid}/pay",
        json={"payment_method": "sim_card_success"},
        headers={"Idempotency-Key": "buyer-pay-0001"},
    )
    assert r.json()["status"] == "SUCCEEDED"
    acc = client.get(f"{V}/me/account").json()
    assert acc["library"][0]["product"]["slug"] == "data-science" and acc["arriving"] == []
    assert acc["library"][0]["progress"][2]["state"] == "done"


def test_only_the_owning_buyer_can_pay_a_buyer_checkout(client, db):
    cid, tok = _guest_chat(client)
    _register_buyer(client, "owner.buyer@example.com", "Owner Buyer")
    pid = str(product(db, "intro-ai").id)
    db.rollback()
    sid = client.post(
        f"{V}/public/conversations/{cid}/enroll", json={"product_id": pid}, headers={"X-Conversation-Token": tok}
    ).json()["checkout_session_id"]
    client.cookies.clear()
    r = client.post(
        f"{V}/public/checkout/{sid}/pay",
        json={"payment_method": "sim_card_success"},
        headers={"Idempotency-Key": "stranger-pay-01"},
    )
    assert r.status_code == 401
    as_buyer(client)  # a different buyer
    r = client.post(
        f"{V}/public/checkout/{sid}/pay",
        json={"payment_method": "sim_card_success"},
        headers={"Idempotency-Key": "stranger-pay-02"},
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_YOUR_ORDER"


def test_link_conversation_merges_into_existing_customer(client, db):
    cid1, tok1 = _guest_chat(client, "Tell me about cybersecurity")
    _register_buyer(client, "merge.buyer@example.com", "Merge Buyer")
    client.post(f"{V}/me/link-conversation", json={"conversation_id": cid1, "access_token": tok1})
    cid2, tok2 = _guest_chat(client, "Compare data science and full stack")  # a second guest chat, same person
    login(client, "merge.buyer@example.com", "longenough1")
    r = client.post(f"{V}/me/link-conversation", json={"conversation_id": cid2, "access_token": tok2})
    assert r.status_code == 200
    acc = client.get(f"{V}/me/account").json()
    assert len(acc["conversations"]) == 2
    assert {p["slug"] for p in acc["recommended"]} == {"cybersecurity", "data-science", "fullstack"}
    # another account cannot grab a conversation already owned
    _register_buyer(client, "thief@example.com", "Thief")
    r = client.post(f"{V}/me/link-conversation", json={"conversation_id": cid2, "access_token": tok2})
    assert r.status_code == 403 and r.json()["error"]["code"] == "CONVERSATION_OWNED"


def test_owner_account_has_both_sides(client):
    r = client.post(
        f"{V}/auth/register",
        json={
            "email": "both@example.com",
            "full_name": "Both Sides",
            "password": "longenough1",
            "role": "owner",
            "business_name": "Both Co",
        },
    )
    assert r.status_code == 201
    flags = client.get(f"{V}/me/flags").json()
    assert flags["is_buyer"] and flags["is_seller"]
