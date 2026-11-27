from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date
import threading
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth import CurrentUser, get_current_user
import app.core.feature_flags as ff_mod
import app.core.sequences as seq_mod
import app.routers.config as cfg_mod
import app.routers.fees as fees_mod


class _FakeResult:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _FakeQuery:
    def __init__(self, db: "FakeSupabase", table_name: str):
        self.db = db
        self.table_name = table_name
        self._op = "select"
        self._filters = []
        self._orders = []
        self._limit = None
        self._single = False
        self._count_mode = None
        self._payload = None

    def select(self, _cols="*", count=None):
        self._op = "select"
        self._count_mode = count
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

    def is_(self, col, val):
        self._filters.append(("is", col, val))
        return self

    def lte(self, col, val):
        self._filters.append(("lte", col, str(val)))
        return self

    def gte(self, col, val):
        self._filters.append(("gte", col, str(val)))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, list(vals)))
        return self

    def order(self, col, desc=False):
        self._orders.append((col, desc))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def single(self):
        self._single = True
        return self

    def _matches(self, row: dict) -> bool:
        for op, col, val in self._filters:
            rv = row.get(col)
            if op == "eq" and rv != val:
                return False
            if op == "is":
                if val == "null" and rv is not None:
                    return False
                if val != "null" and rv != val:
                    return False
            if op == "lte" and (rv is None or str(rv) > val):
                return False
            if op == "gte" and (rv is None or str(rv) < val):
                return False
            if op == "in" and rv not in val:
                return False
        return True

    def execute(self):
        with self.db.lock:
            rows = self.db.tables.setdefault(self.table_name, [])

            if self._op == "select":
                matched = [deepcopy(r) for r in rows if self._matches(r)]
                for col, desc in reversed(self._orders):
                    matched.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
                if self._limit is not None:
                    matched = matched[: self._limit]
                cnt = len(matched) if self._count_mode == "exact" else None
                if self._single:
                    return _FakeResult(matched[0] if matched else None, count=cnt)
                return _FakeResult(matched, count=cnt)

            if self._op == "insert":
                items = self._payload if isinstance(self._payload, list) else [self._payload]
                inserted = []
                for item in items:
                    row = deepcopy(item)
                    row.setdefault("id", str(uuid.uuid4()))
                    row.setdefault("created_at", "2026-01-01T00:00:00Z")
                    if self.table_name == "numbering_sequence_logs":
                        for existing in rows:
                            if (
                                existing["school_id"] == row["school_id"]
                                and existing["sequence_type"] == row["sequence_type"]
                                and existing["generated_number"] == row["generated_number"]
                            ):
                                raise Exception("23505 duplicate key value violates unique constraint")
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


class _FakeRpcCall:
    def __init__(self, db: "FakeSupabase", fn_name: str, params: dict):
        self.db = db
        self.fn_name = fn_name
        self.params = params

    def execute(self):
        if self.fn_name != "generate_next_sequence_number" or not self.db.rpc_enabled:
            raise Exception("PGRST202 function not found")

        with self.db.lock:
            school_id = self.params["p_school_id"]
            seq_type = self.params["p_sequence_type"]
            campus_id = self.params.get("p_campus_id")
            year_id = self.params.get("p_academic_year_id")
            as_of = date.fromisoformat(self.params["p_as_of_date"])

            rows = [
                r
                for r in self.db.tables["numbering_sequences"]
                if r["school_id"] == school_id and r["sequence_type"] == seq_type
            ]
            seq = seq_mod._pick_matching_sequence(rows, campus_id, year_id, as_of)
            if not seq:
                raise Exception(f"NO_ACTIVE_SEQUENCE: No active sequence found for type {seq_type}")

            reset_policy = seq.get("reset_policy", "never")
            period = (
                as_of.strftime("%Y")
                if reset_policy == "yearly"
                else (as_of.strftime("%Y%m") if reset_policy == "monthly" else None)
            )
            if period is not None and seq.get("last_reset_period") != period:
                current = 1
            else:
                current = int(seq["next_number"])

            seq["next_number"] = current + 1
            if period is not None:
                seq["last_reset_period"] = period

            formatted = seq_mod.format_sequence_value(seq, current)
            log_row = {
                "id": str(uuid.uuid4()),
                "school_id": school_id,
                "sequence_id": seq["id"],
                "sequence_type": seq_type,
                "generated_number": formatted,
                "number_value": current,
            }
            for existing in self.db.tables["numbering_sequence_logs"]:
                if (
                    existing["school_id"] == school_id
                    and existing["sequence_type"] == seq_type
                    and existing["generated_number"] == formatted
                ):
                    raise Exception("23505 duplicate key")
            self.db.tables["numbering_sequence_logs"].append(log_row)

            return _FakeResult(
                {
                    "sequence_id": seq["id"],
                    "sequence_type": seq_type,
                    "number_value": current,
                    "formatted_number": formatted,
                    "campus_id": seq.get("campus_id"),
                }
            )


class FakeSupabase:
    def __init__(self, school_id: str):
        self.lock = threading.RLock()
        self.rpc_enabled = True
        self.tables = {
            "schools": [
                {
                    "id": school_id,
                    "name": "Demo International School",
                    "code": "DIS-001",
                    "address": "Main Campus",
                    "primary_color": "#1976d2",
                    "secondary_color": "#9c27b0",
                    "timezone": "UTC",
                    "currency_code": "INR",
                    "currency_symbol": "₹",
                }
            ],
            "campuses": [],
            "academic_years": [],
            "terms": [],
            "calendar_days": [],
            "rooms": [],
            "streams": [],
            "houses": [],
            "numbering_sequences": [],
            "numbering_sequence_logs": [],
            "feature_flags": [],
            "classes": [{"id": "cls-1", "school_id": school_id, "name": "Grade 10", "numeric_level": 10}],
            "sections": [{"id": "sec-1", "school_id": school_id, "class_id": "cls-1", "name": "A"}],
            "enrollments": [],
            "attendance": [],
            "exams": [],
            "exam_marks": [],
            "fee_structures": [],
            "fee_payments": [],
        }

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self, name)

    def rpc(self, fn_name: str, params: dict) -> _FakeRpcCall:
        return _FakeRpcCall(self, fn_name, params)


SCHOOL_ID = "00000000-0000-0000-0000-000000000010"


def mock_admin():
    return CurrentUser(
        id="00000000-0000-0000-0000-000000000001",
        email="admin@test.edu",
        school_id=SCHOOL_ID,
        role="admin",
        full_name="Test Admin",
    )


def mock_student():
    return CurrentUser(
        id="00000000-0000-0000-0000-000000000002",
        email="student@test.edu",
        school_id=SCHOOL_ID,
        role="student",
        full_name="Test Student",
    )


@pytest.fixture()
def fake_db(monkeypatch):
    db = FakeSupabase(SCHOOL_ID)
    for mod in (cfg_mod, ff_mod, seq_mod, fees_mod):
        monkeypatch.setattr(mod, "supabase_admin", db)
    app.dependency_overrides[get_current_user] = mock_admin
    yield db
    app.dependency_overrides.clear()


client = TestClient(app)


def test_organization_config_update_and_validation(fake_db):
    res = client.get("/api/v1/config/organization")
    assert res.status_code == 200
    assert res.json()["currency_code"] == "INR"

    bad_tz = client.put("/api/v1/config/organization", json={"timezone": "Mars/Olympus"})
    assert bad_tz.status_code == 400

    upd = client.put(
        "/api/v1/config/organization",
        json={
            "name": "Apex Academy",
            "timezone": "Asia/Kolkata",
            "currency_code": "usd",
            "currency_symbol": "$",
            "primary_color": "#0d47a1",
        },
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "Apex Academy"
    assert upd.json()["timezone"] == "Asia/Kolkata"
    assert upd.json()["currency_code"] == "USD"
    assert upd.json()["currency_symbol"] == "$"

    app.dependency_overrides[get_current_user] = mock_student
    forbidden = client.put("/api/v1/config/organization", json={"name": "Hack"})
    assert forbidden.status_code == 403


def test_campuses_rooms_and_capacity_checks(fake_db):
    c1 = client.post(
        "/api/v1/config/campuses",
        json={"name": "Main Campus", "code": "MAIN", "is_primary": True},
    )
    assert c1.status_code == 201
    c2 = client.post(
        "/api/v1/config/campuses",
        json={"name": "North Campus", "code": "NORTH", "is_primary": True},
    )
    assert c2.status_code == 201

    campuses = client.get("/api/v1/config/campuses").json()
    primaries = [c for c in campuses if c["is_primary"]]
    assert len(primaries) == 1
    assert primaries[0]["code"] == "NORTH"

    room = client.post(
        "/api/v1/config/rooms",
        json={
            "campus_id": c2.json()["id"],
            "name": "Science Hall",
            "code": "SCI-101",
            "room_type": "lab",
            "capacity": 40,
            "exam_capacity": 25,
        },
    ).json()

    reg_ok = client.post(
        "/api/v1/config/rooms/capacity-check",
        json={"room_id": room["id"], "requested_count": 35, "mode": "regular"},
    )
    assert reg_ok.status_code == 200
    assert reg_ok.json()["fits"] is True
    assert reg_ok.json()["remaining_capacity"] == 5

    exam_fail = client.post(
        "/api/v1/config/rooms/capacity-check",
        json={"room_id": room["id"], "requested_count": 35, "mode": "exam"},
    )
    assert exam_fail.status_code == 200
    assert exam_fail.json()["fits"] is False
    assert exam_fail.json()["overflow"] == 10
    assert "exceeded" in exam_fail.json()["warning"]

    # Section-based automatic enrollment count check
    fake_db.tables["enrollments"].extend(
        [
            {"id": "e1", "school_id": SCHOOL_ID, "section_id": "sec-1", "academic_year_id": "yr-1"},
            {"id": "e2", "school_id": SCHOOL_ID, "section_id": "sec-1", "academic_year_id": "yr-1"},
        ]
    )
    sec_chk = client.get(f"/api/v1/config/rooms/{room['id']}/capacity-check?section_id=sec-1&academic_year_id=yr-1")
    assert sec_chk.status_code == 200
    assert sec_chk.json()["requested_count"] == 2
    assert sec_chk.json()["fits"] is True


def test_terms_and_calendar_conflict_warnings(fake_db):
    fake_db.tables["academic_years"].append(
        {
            "id": "yr-2026",
            "school_id": SCHOOL_ID,
            "name": "2026-2027",
            "start_date": "2026-04-01",
            "end_date": "2027-03-31",
            "is_current": True,
        }
    )

    bad_term = client.post(
        "/api/v1/config/terms",
        json={
            "academic_year_id": "yr-2026",
            "name": "Bad Term",
            "start_date": "2026-01-01",
            "end_date": "2026-05-01",
        },
    )
    assert bad_term.status_code == 400

    term = client.post(
        "/api/v1/config/terms",
        json={
            "academic_year_id": "yr-2026",
            "name": "Term 1",
            "code": "T1",
            "start_date": "2026-04-01",
            "end_date": "2026-09-30",
        },
    )
    assert term.status_code == 201

    # Seed an exam and a fee due date on 2026-08-15
    fake_db.tables["exams"].append(
        {
            "id": "ex-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-2026",
            "class_id": "cls-1",
            "name": "Mid-Term",
            "start_date": "2026-08-10",
            "end_date": "2026-08-20",
        }
    )
    fake_db.tables["fee_structures"].append(
        {
            "id": "fs-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-2026",
            "class_id": "cls-1",
            "name": "Tuition T1",
            "amount": 5000,
            "due_date": "2026-08-15",
        }
    )

    conflict_check = client.get(
        "/api/v1/config/calendar-days/conflicts?day_date=2026-08-15&day_type=holiday&is_working_day=false"
    )
    assert conflict_check.status_code == 200
    body = conflict_check.json()
    assert body["has_conflicts"] is True
    categories = {c["category"] for c in body["conflicts"]}
    assert "exam_conflict" in categories
    assert "fee_due_date_conflict" in categories

    strict_res = client.post(
        "/api/v1/config/calendar-days",
        json={
            "day_date": "2026-08-15",
            "day_type": "holiday",
            "title": "Independence Day",
            "is_working_day": False,
            "reject_on_conflict": True,
        },
    )
    assert strict_res.status_code == 409

    saved_res = client.post(
        "/api/v1/config/calendar-days",
        json={
            "day_date": "2026-08-15",
            "day_type": "holiday",
            "title": "Independence Day",
            "academic_year_id": "yr-2026",
            "is_working_day": False,
        },
    )
    assert saved_res.status_code == 201
    assert len(saved_res.json()["conflicts"]) >= 2


def test_transactional_sequence_uniqueness_under_concurrency(fake_db):
    seq = client.post(
        "/api/v1/config/sequences",
        json={
            "sequence_type": "admission",
            "prefix": "ADM",
            "separator": "-",
            "padding": 4,
            "next_number": 1,
            "reset_policy": "never",
        },
    )
    assert seq.status_code == 201

    # 1) Concurrent writes via RPC path
    def call_next(_idx):
        r = client.post("/api/v1/config/sequences/next", json={"sequence_type": "admission"})
        assert r.status_code == 200
        return r.json()["formatted_number"]

    with ThreadPoolExecutor(max_workers=12) as pool:
        rpc_numbers = list(pool.map(call_next, range(30)))

    assert len(set(rpc_numbers)) == 30
    assert sorted(rpc_numbers)[0] == "ADM-0001"
    assert sorted(rpc_numbers)[-1] == "ADM-0030"

    # 2) Concurrent writes via optimistic-CAS fallback path (RPC disabled)
    fake_db.rpc_enabled = False
    with ThreadPoolExecutor(max_workers=12) as pool:
        cas_numbers = list(pool.map(call_next, range(20)))

    assert len(set(cas_numbers)) == 20
    assert len(set(rpc_numbers + cas_numbers)) == 50
    assert sorted(cas_numbers)[0] == "ADM-0031"
    assert sorted(cas_numbers)[-1] == "ADM-0050"

    # 3) Receipt sequence integration in fees router
    client.post(
        "/api/v1/config/sequences",
        json={
            "sequence_type": "receipt",
            "prefix": "RCPT",
            "separator": "-",
            "padding": 5,
            "next_number": 10,
            "reset_policy": "never",
        },
    )
    fake_db.tables["fee_structures"].append(
        {
            "id": "fs-pay-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-1",
            "class_id": "cls-1",
            "name": "Lab Fee",
            "amount": 1000,
            "due_date": "2026-09-01",
        }
    )
    pay = client.post(
        "/api/v1/fees/payments",
        json={"fee_structure_id": "fs-pay-1", "student_id": "stu-1", "amount_paid": 1000},
    )
    assert pay.status_code == 201
    assert pay.json()["receipt_number"] == "RCPT-00010"


def test_feature_flag_middleware_blocks_disabled_modules(fake_db):
    # Initially fees is enabled -> 200
    assert client.get("/api/v1/fees/structures").status_code == 200

    # Disable fees globally
    toggle = client.put(
        "/api/v1/config/feature-flags/fees",
        json={"is_enabled": False},
    )
    assert toggle.status_code == 200

    blocked = client.get("/api/v1/fees/structures")
    assert blocked.status_code == 403
    assert "fees" in blocked.json()["detail"].lower()

    blocked_post = client.post(
        "/api/v1/fees/structures",
        json={
            "academic_year_id": "yr-1",
            "class_id": "cls-1",
            "name": "Should Fail",
            "amount": 100,
            "due_date": "2026-06-01",
        },
    )
    assert blocked_post.status_code == 403

    # Config endpoints remain accessible so admin can re-enable
    assert client.get("/api/v1/config/feature-flags").json()["modules"]["fees"] is False

    # Re-enable school-wide, but disable only for campus-a
    client.put("/api/v1/config/feature-flags/fees", json={"is_enabled": True})
    client.put(
        "/api/v1/config/feature-flags/fees",
        json={"is_enabled": False, "campus_id": "campus-a"},
    )

    assert client.get("/api/v1/fees/structures").status_code == 200
    assert client.get("/api/v1/fees/structures", headers={"X-Campus-Id": "campus-a"}).status_code == 403
    assert client.get("/api/v1/fees/structures", headers={"X-Campus-Id": "campus-b"}).status_code == 200


def test_academic_year_clone_preview_and_no_student_transactions_copied(fake_db):
    fake_db.tables["academic_years"].append(
        {
            "id": "yr-src",
            "school_id": SCHOOL_ID,
            "name": "2025-2026",
            "start_date": "2025-04-01",
            "end_date": "2026-03-31",
            "is_current": True,
        }
    )
    fake_db.tables["terms"].append(
        {
            "id": "t-src-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-src",
            "name": "Term 1",
            "code": "T1",
            "start_date": "2025-04-01",
            "end_date": "2025-09-30",
            "sequence_order": 1,
        }
    )
    fake_db.tables["calendar_days"].append(
        {
            "id": "cd-src-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-src",
            "day_date": "2025-08-15",
            "day_type": "holiday",
            "title": "Independence Day",
            "is_working_day": False,
        }
    )
    fake_db.tables["fee_structures"].append(
        {
            "id": "fs-src-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-src",
            "class_id": "cls-1",
            "name": "Annual Tuition",
            "amount": 25000,
            "due_date": "2025-05-10",
        }
    )
    fake_db.tables["numbering_sequences"].append(
        {
            "id": "sq-src-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-src",
            "sequence_type": "admission",
            "prefix": "ADM25",
            "separator": "-",
            "padding": 4,
            "next_number": 428,
            "reset_policy": "yearly",
            "is_active": True,
        }
    )
    fake_db.tables["exams"].append(
        {
            "id": "ex-src-1",
            "school_id": SCHOOL_ID,
            "academic_year_id": "yr-src",
            "class_id": "cls-1",
            "name": "Final Exam",
            "start_date": "2026-02-15",
            "end_date": "2026-02-25",
        }
    )

    # Seed historical student transactions that MUST NEVER be cloned
    fake_db.tables["enrollments"].extend(
        [
            {"id": "en-1", "school_id": SCHOOL_ID, "academic_year_id": "yr-src", "student_id": "s1"},
            {"id": "en-2", "school_id": SCHOOL_ID, "academic_year_id": "yr-src", "student_id": "s2"},
        ]
    )
    fake_db.tables["attendance"].extend(
        [
            {"id": "at-1", "school_id": SCHOOL_ID, "academic_year_id": "yr-src", "student_id": "s1"},
            {"id": "at-2", "school_id": SCHOOL_ID, "academic_year_id": "yr-src", "student_id": "s2"},
        ]
    )
    fake_db.tables["fee_payments"].append(
        {"id": "fp-1", "school_id": SCHOOL_ID, "fee_structure_id": "fs-src-1", "student_id": "s1", "amount_paid": 25000}
    )
    fake_db.tables["exam_marks"].append(
        {"id": "em-1", "school_id": SCHOOL_ID, "exam_id": "ex-src-1", "student_id": "s1", "marks_obtained": 92}
    )

    clone_payload = {
        "target_name": "2026-2027",
        "target_start_date": "2026-04-01",
        "target_end_date": "2027-03-31",
        "target_is_current": True,
        "include_terms": True,
        "include_calendar_days": True,
        "include_fee_structures": True,
        "include_sequences": True,
        "include_exams": True,
    }

    # Step 1: Preview does not mutate database
    preview_res = client.post("/api/v1/config/academic-years/yr-src/clone/preview", json=clone_payload)
    assert preview_res.status_code == 200
    pv = preview_res.json()
    assert pv["counts"] == {
        "terms": 1,
        "calendar_days": 1,
        "fee_structures": 1,
        "numbering_sequences": 1,
        "exams": 1,
    }
    assert pv["records_to_clone"]["terms"][0]["start_date"] == "2026-04-01"
    assert pv["records_to_clone"]["calendar_days"][0]["day_date"] == "2026-08-15"
    assert pv["records_to_clone"]["fee_structures"][0]["due_date"] == "2026-05-10"
    assert pv["excluded_student_transactions"] == {
        "enrollments": 2,
        "attendance": 2,
        "fee_payments": 1,
        "exam_marks": 1,
        "copied": 0,
    }
    assert len(fake_db.tables["academic_years"]) == 1

    # Step 2: Execute clone
    exec_res = client.post("/api/v1/config/academic-years/yr-src/clone", json=clone_payload)
    assert exec_res.status_code == 201
    ex = exec_res.json()
    new_year_id = ex["academic_year"]["id"]
    assert ex["academic_year"]["cloned_from_year_id"] == "yr-src"
    assert ex["created_counts"] == {
        "terms": 1,
        "calendar_days": 1,
        "fee_structures": 1,
        "numbering_sequences": 1,
        "exams": 1,
    }
    assert ex["excluded_student_transactions"]["copied"] == 0

    # Verify cloned sequence reset to next_number=1
    cloned_seqs = [s for s in fake_db.tables["numbering_sequences"] if s.get("academic_year_id") == new_year_id]
    assert len(cloned_seqs) == 1
    assert cloned_seqs[0]["next_number"] == 1

    # Verify student transactions were NEVER copied
    assert len(fake_db.tables["enrollments"]) == 2
    assert len(fake_db.tables["attendance"]) == 2
    assert len(fake_db.tables["fee_payments"]) == 1
    assert len(fake_db.tables["exam_marks"]) == 1
    assert all(e["academic_year_id"] == "yr-src" for e in fake_db.tables["enrollments"])

    # Duplicate clone attempt returns 409
    dup_res = client.post("/api/v1/config/academic-years/yr-src/clone", json=clone_payload)
    assert dup_res.status_code == 409
