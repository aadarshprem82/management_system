from datetime import date
import inspect
from typing import Dict, List, Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.auth import CurrentUser, get_current_user
from app.core.supabase import supabase_admin

DEFAULT_MODULES: List[Dict[str, str]] = [
    {"module_key": "academics", "description": "Academic years, classes, sections, and subjects"},
    {"module_key": "users", "description": "User management and student enrollments"},
    {"module_key": "attendance", "description": "Daily attendance roster and summaries"},
    {"module_key": "assessments", "description": "Exams, gradebook marks, and assignments"},
    {"module_key": "fees", "description": "Fee structures, invoicing, and payment receipts"},
    {"module_key": "notices", "description": "School and class notice board"},
    {"module_key": "analytics", "description": "Dashboard analytics and metrics"},
]

MODULE_PREFIX_MAP: Dict[str, str] = {
    "/api/v1/academics": "academics",
    "/api/v1/users": "users",
    "/api/v1/attendance": "attendance",
    "/api/v1/assessments": "assessments",
    "/api/v1/fees": "fees",
    "/api/v1/notices": "notices",
    "/api/v1/analytics": "analytics",
}


def resolve_module_for_path(path: str) -> Optional[str]:
    """Maps an API request path to its module key, or None if core/unflagged."""
    for prefix, module_key in MODULE_PREFIX_MAP.items():
        if path == prefix or path.startswith(f"{prefix}/"):
            return module_key
    return None


def _pick_effective_flag(
    rows: List[dict],
    campus_id: Optional[str],
    as_of: date,
) -> Optional[dict]:
    """Selects the highest-precedence active flag row for campus/date."""
    as_of_iso = as_of.isoformat()
    matching = []
    for row in rows:
        eff_from = str(row.get("effective_from") or "1900-01-01")
        eff_to = row.get("effective_to")
        if eff_from > as_of_iso:
            continue
        if eff_to is not None and str(eff_to) < as_of_iso:
            continue
        row_campus = row.get("campus_id")
        if row_campus is not None and row_campus != campus_id:
            continue
        matching.append(row)

    if not matching:
        return None

    # Campus-specific flag wins over school-wide (None), then most recent effective_from & version
    matching.sort(
        key=lambda r: (
            1 if r.get("campus_id") is not None and r.get("campus_id") == campus_id else 0,
            str(r.get("effective_from") or ""),
            int(r.get("version") or 1),
            str(r.get("created_at") or ""),
        ),
        reverse=True,
    )
    return matching[0]


def get_effective_module_flags(
    school_id: str,
    campus_id: Optional[str] = None,
    as_of_date: Optional[date] = None,
) -> Dict[str, bool]:
    """Returns a mapping of module_key -> enabled boolean for a school/campus."""
    as_of = as_of_date or date.today()
    resolved: Dict[str, bool] = {m["module_key"]: True for m in DEFAULT_MODULES}

    try:
        res = (
            supabase_admin.table("feature_flags")
            .select("module_key, campus_id, is_enabled, effective_from, effective_to, version, created_at")
            .eq("school_id", school_id)
            .execute()
        )
        rows = res.data or []
    except Exception:
        return resolved

    by_module: Dict[str, List[dict]] = {}
    for row in rows:
        by_module.setdefault(row["module_key"], []).append(row)

    for mod_key, mod_rows in by_module.items():
        chosen = _pick_effective_flag(mod_rows, campus_id=campus_id, as_of=as_of)
        if chosen is not None:
            resolved[mod_key] = bool(chosen["is_enabled"])

    return resolved


def is_module_enabled(
    school_id: str,
    module_key: str,
    campus_id: Optional[str] = None,
    as_of_date: Optional[date] = None,
) -> bool:
    """Checks whether a single module is enabled for the given school/campus/date."""
    as_of = as_of_date or date.today()
    try:
        res = (
            supabase_admin.table("feature_flags")
            .select("module_key, campus_id, is_enabled, effective_from, effective_to, version, created_at")
            .eq("school_id", school_id)
            .eq("module_key", module_key)
            .execute()
        )
        rows = res.data or []
    except Exception:
        return True

    chosen = _pick_effective_flag(rows, campus_id=campus_id, as_of=as_of)
    if chosen is None:
        return True
    return bool(chosen["is_enabled"])


async def _resolve_user_for_middleware(request: Request) -> Optional[CurrentUser]:
    """Resolves CurrentUser from FastAPI dependency override (tests) or Bearer token."""
    override = request.app.dependency_overrides.get(get_current_user)
    if override is not None:
        sig = inspect.signature(override)
        result = override(request) if "request" in sig.parameters else override()
        if inspect.isawaitable(result):
            result = await result
        return result

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        user_response = supabase_admin.auth.get_user(token)
        auth_user = user_response.user
        if not auth_user:
            return None
        profile_res = (
            supabase_admin.table("profiles")
            .select("id, email, school_id, role, full_name")
            .eq("id", auth_user.id)
            .single()
            .execute()
        )
        if not profile_res.data:
            return None
        return CurrentUser(**profile_res.data)
    except Exception:
        return None


class FeatureFlagMiddleware(BaseHTTPMiddleware):
    """Blocks requests to module APIs that are disabled via feature flags."""

    async def dispatch(self, request: Request, call_next):
        module_key = resolve_module_for_path(request.url.path)
        if module_key is None or request.method == "OPTIONS":
            return await call_next(request)

        try:
            user = await _resolve_user_for_middleware(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        if user is None:
            # Let downstream FastAPI auth dependencies handle 401/403
            return await call_next(request)

        campus_id = request.headers.get("X-Campus-Id") or request.query_params.get("campus_id")
        if not is_module_enabled(user.school_id, module_key, campus_id=campus_id):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": f"Module '{module_key}' is disabled for this organization."},
            )

        return await call_next(request)


def require_module_enabled(module_key: str):
    """FastAPI dependency variant to enforce a module feature flag."""

    def checker(
        request: Request,
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        campus_id = request.headers.get("X-Campus-Id") or request.query_params.get("campus_id")
        if not is_module_enabled(current_user.school_id, module_key, campus_id=campus_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Module '{module_key}' is disabled for this organization.",
            )
        return current_user

    return checker
