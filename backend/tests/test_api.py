from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import CurrentUser, get_current_user
from app.routers.assessments import compute_letter_grade

client = TestClient(app)


def mock_admin_user():
    return CurrentUser(
        id="00000000-0000-0000-0000-000000000001",
        email="admin@test.edu",
        school_id="00000000-0000-0000-0000-000000000010",
        role="admin",
        full_name="Test Admin",
    )


def mock_student_user():
    return CurrentUser(
        id="00000000-0000-0000-0000-000000000002",
        email="student@test.edu",
        school_id="00000000-0000-0000-0000-000000000010",
        role="student",
        full_name="Test Student",
    )


def test_me_requires_auth():
    res = client.get("/api/v1/me")
    assert res.status_code == 401 or res.status_code == 403


def test_me_returns_current_user():
    app.dependency_overrides[get_current_user] = mock_admin_user
    res = client.get("/api/v1/me")
    assert res.status_code == 200
    assert res.json()["role"] == "admin"
    app.dependency_overrides.clear()


def test_admin_ping_allows_admin():
    app.dependency_overrides[get_current_user] = mock_admin_user
    res = client.get("/api/v1/admin/ping")
    assert res.status_code == 200
    assert "Hello Admin" in res.json()["message"]
    app.dependency_overrides.clear()


def test_admin_ping_blocks_student():
    app.dependency_overrides[get_current_user] = mock_student_user
    res = client.get("/api/v1/admin/ping")
    assert res.status_code == 403
    app.dependency_overrides.clear()


def test_compute_letter_grade():
    assert compute_letter_grade(95) == "A+"
    assert compute_letter_grade(82) == "A"
    assert compute_letter_grade(71) == "B"
    assert compute_letter_grade(60) == "C"
    assert compute_letter_grade(50) == "D"
    assert compute_letter_grade(42) == "F"