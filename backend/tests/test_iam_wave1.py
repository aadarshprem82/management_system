from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import uuid
import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
import app.core.auth as auth_mod
import app.core.feature_flags as ff_mod
import app.routers.iam as iam_mod
import app.routers.fees as fees_mod


SCHOOL_ID = "00000000-0000-0000-0000-000000000010"
ADMIN_ID = "00000000-0000-0000-0000-000000000101"
ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000102"
TEACHER_PARENT_ID = "00000000-0000-0000-0000-000000000103"


def _make_jwt(user_id: str, aal: str = "aal2", iat_offset_seconds: int = 0) -> str:
    now = datetime.now(timezone.utc) + timedelta(seconds=iat_offset_seconds)
    payload = {
        "sub": user_id,
        "aal": aal,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, "test-secret", algorithm="HS256")


class _FakeResult:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _FakeQuery:
    def __init__(self, db: "FakeIamSupabase", table_name: str):
        self.db = db
        self.table_name = table_name
        self._op = "select"
        self._filters = []
        self._orders = []
        self._single = False
        self._payload = None

    def select(self, _cols="*", count=None):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def order(self, col, desc=False):
        self._orders.append((col, desc))
        return self

    def single(self):
        self._single = True
        return self

    def _matches(self, row: dict) -> bool:
        for op, col, val in self._filters:
            if op == "eq" and row.get(col) != val:
                return False
        return True

    def execute(self):
        rows = self.db.tables.setdefault(self.table_name, [])
        if self._op == "select":
            matched = [deepcopy(r) for r in rows if self._matches(r)]
            for col, desc in reversed(self._orders):
                matched.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
            if self._single:
                return _FakeResult(matched[0] if matched else None)
            return _FakeResult(matched)

        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for item in items:
                row = deepcopy(item)
                row.setdefault("id", str(uuid.uuid4()))
                row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                rows.append(row)
                inserted.append(deepcopy(row))
            return _FakeResult(inserted)

        if self._op == "update":
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(deepcopy(self._payload))
                    updated.append(deepcopy(row))
            return _FakeResult(updated)

        if self._op == "delete":
            kept = []
            deleted = []
            for row in rows:
                if self._matches(row):
                    deleted.append(deepcopy(row))
                else:
                    kept.append(row)
            self.db.tables[self.table_name] = kept
            return _FakeResult(deleted)

        return _FakeResult([])


class _FakeAuthAdmin:
    def __init__(self, db: "FakeIamSupabase"):
        self.db = db

    def invite_user_by_email(self, email: str, options=None):
        uid = str(uuid.uuid4())
        self.db.invited_emails.append(email)
        return SimpleNamespace(user=SimpleNamespace(id=uid, email=email))

    def create_user(self, attrs: dict):
        uid = str(uuid.uuid4())
        return SimpleNamespace(user=SimpleNamespace(id=uid, email=attrs["email"]))

    def update_user_by_id(self, uid: str, attrs: dict):
        self.db.auth_updates.append((uid, attrs))
        return SimpleNamespace(user=SimpleNamespace(id=uid))

    def delete_user(self, uid: str):
        return None


class _FakeAuth:
    def __init__(self, db: "FakeIamSupabase"):
        self.db = db
        self.admin = _FakeAuthAdmin(db)

    def get_user(self, token: str):
        claims = jwt.decode(token, options={"verify_signature": False})
        uid = claims["sub"]
        return SimpleNamespace(user=SimpleNamespace(id=uid, aal=claims.get("aal", "aal1")))


class _FakeRpcCall:
    def __init__(self, db: "FakeIamSupabase", fn_name: str, params: dict):
        self.db = db
        self.fn_name = fn_name
        self.params = params

    def execute(self):
        self.db.rpc_calls.append((self.fn_name, self.params))
        return _FakeResult(None)


class FakeIamSupabase:
    def __init__(self):
        self.auth = _FakeAuth(self)
        self.invited_emails = []
        self.auth_updates = []
        self.rpc_calls = []
        self.tables = {
            "schools": [{"id": SCHOOL_ID, "name": "Demo School", "code": "DIS-001"}],
            "campuses": [{"id": "camp-1", "school_id": SCHOOL_ID, "name": "Main", "code": "MAIN"}],
            "feature_flags": [],
            "profiles": [
                {
                    "id": ADMIN_ID,
                    "school_id": SCHOOL_ID,
                    "role": "admin",
                    "full_name": "Principal Admin",
                    "email": "admin@school.edu",
                    "status": "active",
                    "mfa_enforced": False,
                },
                {
                    "id": ACCOUNTANT_ID,
                    "school_id": SCHOOL_ID,
                    "role": "accountant",
                    "full_name": "Chief Accountant",
                    "email": "acc@school.edu",
                    "status": "active",
                    "mfa_enforced": False,
                },
                {
                    "id": TEACHER_PARENT_ID,
                    "school_id": SCHOOL_ID,
                    "role": "teacher",
                    "full_name": "Dual Role User",
                    "email": "dual@school.edu",
                    "status": "active",
                    "mfa_enforced": False,
                },
            ],
            "user_roles": [
                {
                    "id": "ur-1",
                    "school_id": SCHOOL_ID,
                    "user_id": ADMIN_ID,
                    "role": "admin",
                    "campus_id": None,
                    "is_primary": True,
                    "is_active": True,
                    "effective_from": "2025-01-01",
                    "effective_to": None,
                },
                {
                    "id": "ur-2",
                    "school_id": SCHOOL_ID,
                    "user_id": ACCOUNTANT_ID,
                    "role": "accountant",
                    "campus_id": None,
                    "is_primary": True,
                    "is_active": True,
                    "effective_from": "2025-01-01",
                    "effective_to": None,
                },
                {
                    "id": "ur-3",
                    "school_id": SCHOOL_ID,
                    "user_id": TEACHER_PARENT_ID,
                    "role": "teacher",
                    "campus_id": "camp-1",
                    "is_primary": True,
                    "is_active": True,
                    "effective_from": "2025-01-01",
                    "effective_to": None,
                    "campus": {"id": "camp-1", "name": "Main", "code": "MAIN"},
                },
                {
                    "id": "ur-4",
                    "school_id": SCHOOL_ID,
                    "user_id": TEACHER_PARENT_ID,
                    "role": "parent",
                    "campus_id": None,
                    "is_primary": False,
                    "is_active": True,
                    "effective_from": "2025-01-01",
                    "effective_to": None,
                },
                {
                    "id": "ur-expired",
                    "school_id": SCHOOL_ID,
                    "user_id": TEACHER_PARENT_ID,
                    "role": "librarian",
                    "campus_id": None,
                    "is_primary": False,
                    "is_active": True,
                    "effective_from": "2020-01-01",
                    "effective_to": "2021-01-01",
                },
            ],
            "user_consents": [],
            "approval_requests": [],
            "fee_structures": [
                {"id": "fs-1", "school_id": SCHOOL_ID, "name": "Tuition", "amount": 5000, "due_date": "2026-08-01"}
            ],
            "fee_payments": [
                {
                    "id": "pay-1",
                    "school_id": SCHOOL_ID,
                    "fee_structure_id": "fs-1",
                    "student_id": "stu-1",
                    "amount_paid": 5000,
                    "status": "paid",
                    "payment_date": "2026-08-01",
                    "receipt_number": "RCPT-0001",
                }
            ],
        }

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self, name)

    def rpc(self, fn_name: str, params: dict) -> _FakeRpcCall:
        return _FakeRpcCall(self, fn_name, params)


@pytest.fixture()
def iam_db(monkeypatch):
    app.dependency_overrides.clear()
    db = FakeIamSupabase()
    for mod in (auth_mod, ff_mod, iam_mod, fees_mod):
        monkeypatch.setattr(mod, "supabase_admin", db)
    yield db
    app.dependency_overrides.clear()


client = TestClient(app)


def test_mfa_aal2_enforced_for_privileged_and_finance_roles(iam_db):
    acc_aal1 = _make_jwt(ACCOUNTANT_ID, aal="aal1")
    acc_aal2 = _make_jwt(ACCOUNTANT_ID, aal="aal2")
    teacher_aal1 = _make_jwt(TEACHER_PARENT_ID, aal="aal1")

    # Bootstrap routes remain reachable at aal1 so frontend can trigger MFA flow
    me_res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {acc_aal1}"})
    assert me_res.status_code == 200
    assert me_res.json()["mfa_required"] is True
    assert me_res.json()["aal"] == "aal1"

    # Finance routes reject non-MFA (aal1) sessions
    fee_res_aal1 = client.get("/api/v1/fees/structures", headers={"Authorization": f"Bearer {acc_aal1}"})
    assert fee_res_aal1.status_code == 403
    assert "aal2" in fee_res_aal1.json()["detail"].lower()

    pay_res_aal1 = client.get("/api/v1/fees/payments", headers={"Authorization": f"Bearer {acc_aal1}"})
    assert pay_res_aal1.status_code == 403

    # With aal2, finance routes succeed
    pay_res_aal2 = client.get("/api/v1/fees/payments", headers={"Authorization": f"Bearer {acc_aal2}"})
    assert pay_res_aal2.status_code == 200
    assert len(pay_res_aal2.json()) == 1

    # Non-privileged teacher can access non-privileged endpoints at aal1
    ctx_res = client.get("/api/v1/iam/contexts", headers={"Authorization": f"Bearer {teacher_aal1}"})
    assert ctx_res.status_code == 200
    assert ctx_res.json()["mfa_required"] is False


def test_suspended_users_blocked_immediately_and_sessions_revoked(iam_db):
    admin_token = _make_jwt(ADMIN_ID, aal="aal2")
    old_teacher_token = _make_jwt(TEACHER_PARENT_ID, aal="aal1", iat_offset_seconds=-10)

    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {old_teacher_token}"}).status_code == 200

    # Suspend user with mandatory reason
    bad_susp = client.post(
        f"/api/v1/iam/users/{TEACHER_PARENT_ID}/suspend",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "x"},
    )
    assert bad_susp.status_code == 422

    susp = client.post(
        f"/api/v1/iam/users/{TEACHER_PARENT_ID}/suspend",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Policy violation investigation"},
    )
    assert susp.status_code == 200
    assert susp.json()["status"] == "suspended"

    # Verify Supabase Auth ban & session revocation RPC triggered
    assert any(uid == TEACHER_PARENT_ID and attrs.get("ban_duration") == "876000h" for uid, attrs in iam_db.auth_updates)
    assert ("revoke_user_sessions", {"p_user_id": TEACHER_PARENT_ID}) in iam_db.rpc_calls

    # Existing unexpired JWT is immediately blocked
    blocked = client.get("/api/v1/me", headers={"Authorization": f"Bearer {old_teacher_token}"})
    assert blocked.status_code == 403
    assert "suspended" in blocked.json()["detail"].lower()

    # Reinstate user
    reinst = client.post(
        f"/api/v1/iam/users/{TEACHER_PARENT_ID}/reinstate",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Cleared after review"},
    )
    assert reinst.status_code == 200
    assert reinst.json()["status"] == "active"
    assert any(uid == TEACHER_PARENT_ID and attrs.get("ban_duration") == "none" for uid, attrs in iam_db.auth_updates)

    # Pre-revocation JWT remains invalidated (401), fresh post-reinstate JWT works (200)
    stale_res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {old_teacher_token}"})
    assert stale_res.status_code == 401

    fresh_token = _make_jwt(TEACHER_PARENT_ID, aal="aal1", iat_offset_seconds=5)
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {fresh_token}"}).status_code == 200


def test_multi_role_contexts_and_consents(iam_db):
    dual_token = _make_jwt(TEACHER_PARENT_ID, aal="aal1")

    # Default primary context is teacher @ camp-1
    ctx = client.get("/api/v1/iam/contexts", headers={"Authorization": f"Bearer {dual_token}"})
    assert ctx.status_code == 200
    body = ctx.json()
    assert body["active_role"] == "teacher"
    assert body["active_campus_id"] == "camp-1"
    # Expired librarian role is filtered out
    role_names = [r["role"] for r in body["roles"]]
    assert set(role_names) == {"teacher", "parent"}

    # Switch context to parent
    parent_ctx = client.get(
        "/api/v1/iam/contexts",
        headers={"Authorization": f"Bearer {dual_token}", "X-Active-Role": "parent"},
    )
    assert parent_ctx.status_code == 200
    assert parent_ctx.json()["active_role"] == "parent"

    # Cannot spoof unassigned role
    spoof = client.get(
        "/api/v1/iam/contexts",
        headers={"Authorization": f"Bearer {dual_token}", "X-Active-Role": "super_admin"},
    )
    assert spoof.status_code == 403

    # Consent check & acceptance
    c0 = client.get("/api/v1/iam/consents/me", headers={"Authorization": f"Bearer {dual_token}"})
    assert c0.status_code == 200
    assert c0.json()["has_accepted_current"] is False

    acc = client.post(
        "/api/v1/iam/consents/accept",
        headers={"Authorization": f"Bearer {dual_token}"},
        json={"policy_key": "terms_and_privacy", "version": "2026.1", "channel": "web"},
    )
    assert acc.status_code == 201
    assert acc.json()["channel"] == "web"

    c1 = client.get("/api/v1/iam/consents/me", headers={"Authorization": f"Bearer {dual_token}"})
    assert c1.json()["has_accepted_current"] is True


def test_segregation_of_duties_and_require_dual_control(iam_db):
    maker_token = _make_jwt(ADMIN_ID, aal="aal2")
    checker_token = _make_jwt(ACCOUNTANT_ID, aal="aal2")

    # Maker creates a high-risk fee void request
    req_res = client.post(
        "/api/v1/iam/approvals",
        headers={"Authorization": f"Bearer {maker_token}"},
        json={
            "action_type": "fee_payment_void",
            "resource_type": "fee_payment",
            "resource_id": "pay-1",
            "reason": "Duplicate card swipe",
        },
    )
    assert req_res.status_code == 201
    req_id = req_res.json()["id"]

    # High-risk route without approval header -> 403 DUAL_CONTROL_REQUIRED
    no_hdr = client.post(
        "/api/v1/fees/payments/pay-1/void",
        headers={"Authorization": f"Bearer {maker_token}"},
    )
    assert no_hdr.status_code == 403

    # High-risk route with pending approval -> 409
    pending_hdr = client.post(
        "/api/v1/fees/payments/pay-1/void",
        headers={"Authorization": f"Bearer {maker_token}", "X-Approval-Request-Id": req_id},
    )
    assert pending_hdr.status_code == 409

    # Maker CANNOT approve their own request -> 403 Segregation of Duties
    self_approve = client.post(
        f"/api/v1/iam/approvals/{req_id}/decision",
        headers={"Authorization": f"Bearer {maker_token}"},
        json={"decision": "approved", "review_notes": "Trying self-approval"},
    )
    assert self_approve.status_code == 403
    assert "segregation of duties" in self_approve.json()["detail"].lower()

    # Checker (distinct user) approves
    checker_approve = client.post(
        f"/api/v1/iam/approvals/{req_id}/decision",
        headers={"Authorization": f"Bearer {checker_token}"},
        json={"decision": "approved", "review_notes": "Verified bank reversal"},
    )
    assert checker_approve.status_code == 200
    assert checker_approve.json()["status"] == "approved"
    assert checker_approve.json()["reviewed_by"] == ACCOUNTANT_ID

    # Execute dual-control protected finance operation -> 200
    void_res = client.post(
        "/api/v1/fees/payments/pay-1/void",
        headers={"Authorization": f"Bearer {maker_token}", "X-Approval-Request-Id": req_id},
    )
    assert void_res.status_code == 200
    assert void_res.json()["voided"] is True

    # Replay of same executed approval is blocked (409)
    replay_res = client.post(
        "/api/v1/fees/payments/pay-1/void",
        headers={"Authorization": f"Bearer {maker_token}", "X-Approval-Request-Id": req_id},
    )
    assert replay_res.status_code == 409


def test_invite_user_with_expanded_roles_and_multi_role(iam_db):
    admin_token = _make_jwt(ADMIN_ID, aal="aal2")
    inv = client.post(
        "/api/v1/iam/users/invite",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "full_name": "New Admissions Lead",
            "email": "admissions@school.edu",
            "role": "admissions_officer",
            "campus_id": "camp-1",
            "mfa_enforced": True,
            "additional_roles": [{"role": "librarian"}],
        },
    )
    assert inv.status_code == 201
    body = inv.json()
    assert body["status"] == "invited"
    assert body["role"] == "admissions_officer"
    assert len(body["user_roles"]) == 2
    assert "admissions@school.edu" in iam_db.invited_emails
