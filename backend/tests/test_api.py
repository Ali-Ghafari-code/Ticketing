import json

from openpyxl import Workbook

from tests.conftest import HEADERS, login


def _ticket_meta(client, auth):
    r = client.get("/api/tickets/meta", headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_login_me_and_bad_password(client):
    auth = login(client, "admin@demo.local")
    me = client.get("/api/auth/me", headers=auth).json()
    assert me["company"]["slug"] == "demo"
    assert "tickets.view_all" in me["permissions"]
    r = client.post("/api/auth/login", json={"identifier": "admin@demo.local", "password": "wrong"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"
    # login with Persian digits mobile
    r = client.post("/api/auth/login", json={"identifier": "۰۹۱۲۴۴۴۴۴۰۱", "password": "Demo@12345"})
    assert r.status_code == 200


def test_refresh_rotation_and_reuse_detection(client):
    r = client.post("/api/auth/login", json={"identifier": "agent@demo.local", "password": "Demo@12345"})
    old_cookie = r.cookies.get("tk_refresh")
    assert old_cookie
    r2 = client.post("/api/auth/refresh", headers=HEADERS)
    assert r2.status_code == 200
    new_cookie = r2.cookies.get("tk_refresh")
    assert new_cookie and new_cookie != old_cookie
    # without CSRF header -> rejected
    assert client.post("/api/auth/refresh").status_code == 403


def test_customer_ticket_lifecycle_and_isolation(client):
    customer = login(client, "customer@demo.local")
    meta = _ticket_meta(client, customer)
    category = meta["categories"][0]["children"][0]["id"]
    payload = {"subject": "خطا در صفحه پرداخت", "description": "<p>سلام<script>alert(1)</script></p>",
               "category_id": category}
    r = client.post("/api/tickets", data={"payload": json.dumps(payload)},
                    files=[("files", ("shot.png", b"\x89PNG\r\n\x1a\n" + b"0" * 100, "image/png"))],
                    headers=customer)
    assert r.status_code == 201, r.text
    ticket_id = r.json()["id"]
    detail = client.get(f"/api/tickets/{ticket_id}", headers=customer).json()
    assert "<script>" not in detail["description"]
    assert detail["department"] is not None  # auto-routed from category
    assert detail["sla_status"] in ("healthy", "warning")
    assert len(detail["attachments"]) == 1

    # disallowed file type
    r = client.post(f"/api/tickets/{ticket_id}/attachments", files=[("files", ("x.exe", b"MZ....", "application/x"))],
                    headers=customer)
    assert r.status_code == 400

    # another tenant cannot see it
    other = login(client, "admin@ava.local")
    assert client.get(f"/api/tickets/{ticket_id}", headers=other).status_code == 404
    assert client.get(f"/api/attachments/{detail['attachments'][0]['id']}", headers=other).status_code == 404
    # another customer cannot see it
    other_customer = login(client, "customer2@demo.local")
    assert client.get(f"/api/tickets/{ticket_id}", headers=other_customer).status_code == 404

    # agent reply + internal note with mention
    manager = login(client, "manager@demo.local")
    me_manager = client.get("/api/auth/me", headers=manager).json()
    r = client.post(f"/api/tickets/{ticket_id}/messages", data={"body": "<p>در حال بررسی هستیم</p>"}, headers=manager)
    assert r.status_code == 201, r.text
    note = f'<p>نکته <span data-type="mention" data-id="{me_manager["id"]}">@x</span></p>'
    r = client.post(f"/api/tickets/{ticket_id}/messages", data={"body": note, "is_internal": "true"}, headers=manager)
    assert r.status_code == 201 and r.json()["is_internal"]

    msgs = client.get(f"/api/tickets/{ticket_id}/messages", headers=customer).json()
    assert all(not m["is_internal"] for m in msgs)
    assert len(msgs) == 1
    # customer cannot post internal notes
    r = client.post(f"/api/tickets/{ticket_id}/messages", data={"body": "x", "is_internal": "true"}, headers=customer)
    assert r.status_code == 403

    detail = client.get(f"/api/tickets/{ticket_id}", headers=manager).json()
    assert detail["status"]["code"] == "pending_customer"
    assert detail["first_responded_at"] is not None
    assert detail["assigned_agent"] is not None

    # customer reply moves to pending_support
    client.post(f"/api/tickets/{ticket_id}/messages", data={"body": "ممنون"}, headers=customer)
    assert client.get(f"/api/tickets/{ticket_id}", headers=manager).json()["status"]["code"] == "pending_support"

    # resolve & rate
    resolved = next(s for s in meta["statuses"] if s["code"] == "resolved")
    r = client.put(f"/api/tickets/{ticket_id}", json={"status_id": resolved["id"]}, headers=manager)
    assert r.status_code == 200, r.text
    assert r.json()["sla_status"] in ("met", "breached")
    r = client.post(f"/api/tickets/{ticket_id}/rating", json={"rating": 5, "feedback": "عالی"}, headers=customer)
    assert r.status_code == 201
    assert client.post(f"/api/tickets/{ticket_id}/rating", json={"rating": 4}, headers=customer).status_code == 403

    history = client.get(f"/api/tickets/{ticket_id}/activities", headers=manager).json()
    assert any(h["action"] == "status_changed" for h in history)

    notifications = client.get("/api/notifications", headers=customer).json()
    assert notifications["total"] >= 1


def test_ticket_list_filters_and_quick_update(client):
    auth = login(client, "manager@demo.local")
    r = client.get("/api/tickets", params={"state": "active", "sort": "priority", "page_size": 5}, headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] > 0 and len(data["items"]) <= 5
    r = client.get("/api/tickets", params={"q": "PT-10"}, headers=auth)
    assert r.json()["total"] > 0
    meta = _ticket_meta(client, auth)
    ticket = data["items"][0]
    urgent = next(p for p in meta["priorities"] if p["code"] == "urgent")
    r = client.put(f"/api/tickets/{ticket['id']}", json={"priority_id": urgent["id"],
                                                        "assigned_agent_id": meta["agents"][0]["id"]}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["priority"]["code"] == "urgent"
    r = client.post("/api/tickets/bulk", json={"ticket_ids": [ticket["id"]], "add_tag_ids": [meta["tags"][0]["id"]]},
                    headers=auth)
    assert r.status_code == 200


def test_agent_visibility_is_limited(client):
    agent = login(client, "agent5@demo.local")
    manager = login(client, "manager@demo.local")
    total_agent = client.get("/api/tickets", headers=agent).json()["total"]
    total_manager = client.get("/api/tickets", headers=manager).json()["total"]
    assert 0 < total_agent < total_manager
    # agent cannot delete
    ticket_id = client.get("/api/tickets", headers=agent).json()["items"][0]["id"]
    assert client.delete(f"/api/tickets/{ticket_id}", headers=agent).status_code == 403


def test_exports_and_reports(client):
    auth = login(client, "admin@demo.local")
    for fmt in ("xlsx", "csv", "pdf"):
        r = client.get("/api/tickets/export", params={"fmt": fmt}, headers=auth)
        assert r.status_code == 200, r.text
        assert len(r.content) > 100
    r = client.get("/api/reports/export", params={"report": "by_agent", "fmt": "pdf"}, headers=auth)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    r = client.get("/api/reports/tickets", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["total"] > 0 and len(body["by_date"]) == 30
    dash = client.get("/api/dashboard", headers=auth).json()
    assert dash["type"] == "admin" and "summary" in dash["admin"]
    agent_dash = client.get("/api/dashboard", headers=login(client, "agent@demo.local")).json()
    assert agent_dash["type"] == "agent"
    sat = client.get("/api/reports/satisfaction", headers=auth).json()
    assert sat["count"] > 0


def test_kb_faq_search(client):
    customer = login(client, "customer@demo.local")
    arts = client.get("/api/kb/articles", params={"q": "رمز"}, headers=customer).json()
    assert arts["total"] >= 1
    slug = arts["items"][0]["slug"]
    art = client.get(f"/api/kb/articles/{slug}", headers=customer).json()
    assert art["views"] >= 1
    assert client.post(f"/api/kb/articles/{slug}/feedback", json={"helpful": True}, headers=customer).status_code == 200
    tagged = client.get("/api/kb/articles", params={"tag": "پیامک"}, headers=customer).json()
    assert tagged["total"] >= 1
    assert len(client.get("/api/faq", params={"q": "رمز"}, headers=customer).json()) >= 1
    res = client.get("/api/search", params={"q": "پرداخت"}, headers=login(client, "admin@demo.local")).json()
    assert res["tickets"] or res["articles"]
    # customer cannot create articles
    r = client.post("/api/kb/articles", json={"title": "abc", "content": "<p>x</p>"}, headers=customer)
    assert r.status_code == 403


def test_excel_import(client):
    auth = login(client, "admin@demo.local")
    assert client.get("/api/import/customers/template", headers=auth).status_code == 200
    wb = Workbook()
    ws = wb.active
    ws.append(["name", "mobile", "email", "org", "notes"])
    ws.append(["مشتری جدید", "09390001122", "newc@example.com", "شرکت", ""])
    ws.append(["تکراری", "09124444401", "", "", ""])
    ws.append(["", "bad", "", "", ""])
    import io

    buf = io.BytesIO()
    wb.save(buf)
    r = client.post("/api/import/customers/preview", files={"file": ("c.xlsx", buf.getvalue())}, headers=auth)
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["valid"] == 1 and preview["invalid"] == 2 and preview["duplicates"] == 1
    r = client.post("/api/import/customers/commit", json={"rows": preview["rows"]}, headers=auth)
    assert r.json()["created"] == 1


def test_super_admin_and_permissions(client):
    admin = login(client, "superadmin@helpdesk.local", "Admin@12345")
    companies = client.get("/api/companies", headers=admin).json()
    assert companies["total"] >= 2
    demo = next(c for c in companies["items"] if c["slug"] == "demo")
    r = client.get("/api/tickets", headers={**admin, "X-Company-Id": demo["id"]})
    assert r.status_code == 200 and r.json()["total"] > 0
    assert client.get("/api/platform/stats", headers=admin).json()["companies"] >= 2
    # company admin cannot access platform endpoints
    assert client.get("/api/companies", headers=login(client, "admin@demo.local")).status_code == 403
    # custom role
    auth = login(client, "admin@demo.local")
    r = client.post("/api/roles", json={"name": "auditor", "display_name": "ممیز", "permission_codes":
                                        ["tickets.view", "tickets.view_all", "reports.view"]}, headers=auth)
    assert r.status_code == 201, r.text
    r = client.post("/api/roles", json={"name": "hacker", "display_name": "نقش غیرمجاز", "permission_codes":
                                        ["companies.manage"]}, headers=auth)
    assert r.status_code == 403
    logs = client.get("/api/audit-logs", headers=auth).json()
    assert logs["total"] > 0


def test_register_and_password_flows(client):
    r = client.post("/api/auth/register", json={"company_slug": "demo", "full_name": "کاربر تازه",
                                                "mobile": "۰۹۳۵۱۱۱۲۲۳۳", "password": "Pass1234"})
    assert r.status_code == 201, r.text
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/auth/me", headers=auth).json()
    assert me["mobile"] == "09351112233" and me["user_type"] == "customer"
    r = client.post("/api/auth/change-password", json={"current_password": "Pass1234", "new_password": "NewPass123"},
                    headers=auth)
    assert r.status_code == 200
    # SMS reset flow through console provider
    from app.services.sms.console import ConsoleSmsProvider

    client.post("/api/auth/forgot-password", json={"identifier": "09351112233"})
    code = ConsoleSmsProvider.outbox[-1][1].split(":")[1].split()[0]
    r = client.post("/api/auth/reset-password", json={"identifier": "09351112233", "code": code,
                                                      "new_password": "Reset12345"})
    assert r.status_code == 200, r.text
    assert client.post("/api/auth/login", json={"identifier": "09351112233", "password": "Reset12345"}).status_code == 200
    # weak password rejected with Persian message
    r = client.post("/api/auth/register", json={"company_slug": "demo", "full_name": "x y", "email": "a@b.co",
                                                "password": "123"})
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["message"]
