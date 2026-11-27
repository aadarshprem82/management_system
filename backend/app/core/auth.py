from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
import jwt
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.core.supabase import supabase_admin

security = HTTPBearer()

ALL_USER_ROLES = (
    "super_admin",
    "admin",
    "principal",
    "admissions_officer",
    "accountant",
    "librarian",
    "transport_manager",
    "nurse",
    "auditor",
    "teacher",
    "student",
    "parent",
)

ADMIN_EQUIVALENT_ROLES = {"super_admin", "admin"}
PRIVILEGED_MFA_ROLES = {"super_admin", "admin", "principal", "accountant", "auditor"}
FINANCE_ROLES = {"super_admin", "admin", "accountant", "auditor"}

MFA_BOOTSTRAP_EXEMPT_PREFIXES = (
    "/api/v1/me",
    "/api/v1/iam/contexts",
    "/api/v1/iam/consents",
    "/api/v1/iam/mfa",
    "/api/v1/config/organization",
    "/api/v1/config/feature-flags",
)


class RoleContextItem(BaseModel):
    id: Optional[str] = None
    role: str
    campus_id: Optional[str] = None
    campus_name: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    is_primary: bool = False


class CurrentUser(BaseModel):
    id: str
    email: str
    school_id: str
    role: str
    full_name: str
    primary_role: Optional[str] = None
    active_campus_id: Optional[str] = None
    status: str = "active"
    aal: Optional[str] = None
    mfa_required: bool = False
    roles: List[RoleContextItem] = Field(default_factory=list)


def _decode_jwt_claims(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, options={"verify_signature": False})
    except Exception:
        return {}


def _parse_iso_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _filter_effective_roles(rows: List[dict], as_of: date) -> List[RoleContextItem]:
    as_of_iso = as_of.isoformat()
    items: List[RoleContextItem] = []
    for row in rows:
        if not row.get("is_active", True):
            continue
        eff_from = str(row.get("effective_from") or "1900-01-01")
        eff_to = row.get("effective_to")
        if eff_from > as_of_iso:
            continue
        if eff_to is not None and str(eff_to) < as_of_iso:
            continue
        campus_obj = row.get("campus")
        items.append(
            RoleContextItem(
                id=row.get("id"),
                role=row["role"],
                campus_id=row.get("campus_id"),
                campus_name=campus_obj.get("name") if isinstance(campus_obj, dict) else None,
                effective_from=row.get("effective_from"),
                effective_to=row.get("effective_to"),
                is_primary=bool(row.get("is_primary", False)),
            )
        )
    return items


def _is_mfa_bootstrap_exempt(path: str) -> bool:
    return any(path == prefix or path.startswith(f"{prefix}/") for prefix in MFA_BOOTSTRAP_EXEMPT_PREFIXES)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    token = credentials.credentials
    try:
        user_response = supabase_admin.auth.get_user(token)
        auth_user = user_response.user
        if not auth_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        profile_res = (
            supabase_admin.table("profiles")
            .select("*")
            .eq("id", auth_user.id)
            .single()
            .execute()
        )
        profile = profile_res.data
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User profile not found",
            )

        # 1. Immediate block for suspended / archived users
        user_status = profile.get("status") or "active"
        if user_status in ("suspended", "archived"):
            reason = profile.get("status_reason")
            msg = f"Account is {user_status}." + (f" Reason: {reason}" if reason else "")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)

        claims = _decode_jwt_claims(token)

        # 2. Immediate rejection if session was revoked after token issuance
        revoked_at = _parse_iso_dt(profile.get("session_revoked_at"))
        token_iat = claims.get("iat")
        if revoked_at and token_iat is not None:
            issued_dt = datetime.fromtimestamp(float(token_iat), tz=timezone.utc)
            if issued_dt <= revoked_at:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session has been revoked. Please sign in again.",
                )

        # 3. Load multi-role contexts from user_roles (falling back gracefully to profile.role)
        roles: List[RoleContextItem] = []
        try:
            ur_res = (
                supabase_admin.table("user_roles")
                .select("id, role, campus_id, effective_from, effective_to, is_primary, is_active, campus:campuses(id, name)")
                .eq("user_id", auth_user.id)
                .eq("school_id", profile["school_id"])
                .eq("is_active", True)
                .execute()
            )
            roles = _filter_effective_roles(ur_res.data or [], date.today())
        except Exception:
            roles = []

        if not roles:
            roles = [
                RoleContextItem(
                    role=profile["role"],
                    campus_id=profile.get("campus_id"),
                    is_primary=True,
                )
            ]

        # Resolve requested role/campus context headers
        requested_role = request.headers.get("X-Active-Role")
        requested_campus = request.headers.get("X-Campus-Id") or request.query_params.get("campus_id")

        if requested_role:
            matching = [
                r
                for r in roles
                if r.role == requested_role
                and (
                    requested_campus is None
                    or r.campus_id is None
                    or r.campus_id == requested_campus
                )
            ]
            if not matching:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Requested role context '{requested_role}' is not assigned to this user.",
                )
            chosen = matching[0]
        else:
            primaries = [r for r in roles if r.is_primary]
            chosen = primaries[0] if primaries else roles[0]

        active_role = chosen.role
        active_campus_id = requested_campus or chosen.campus_id or profile.get("campus_id")

        # 4. Supabase MFA (aal2) enforcement for privileged/finance roles
        aal = str(claims.get("aal") or getattr(auth_user, "aal", None) or "aal1").lower()
        mfa_required = (active_role in PRIVILEGED_MFA_ROLES) or bool(profile.get("mfa_enforced"))

        if mfa_required and aal != "aal2" and not _is_mfa_bootstrap_exempt(request.url.path):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Multi-factor authentication (aal2) is required for privileged or finance roles.",
                headers={"X-MFA-Required": "aal2"},
            )

        return CurrentUser(
            id=profile["id"],
            email=profile["email"],
            school_id=profile["school_id"],
            role=active_role,
            primary_role=profile["role"],
            full_name=profile["full_name"],
            active_campus_id=active_campus_id,
            status=user_status,
            aal=aal,
            mfa_required=mfa_required,
            roles=roles,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {exc}",
        )


def require_roles(allowed_roles: List[str]):
    expanded_roles = set(allowed_roles)
    if "admin" in expanded_roles:
        expanded_roles.update(ADMIN_EQUIVALENT_ROLES)

    def role_checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.status in ("suspended", "archived"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is {current_user.status}.",
            )
        if current_user.role not in expanded_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}",
            )
        if (current_user.role in PRIVILEGED_MFA_ROLES or current_user.mfa_required) and current_user.aal == "aal1":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Multi-factor authentication (aal2) is required for privileged or finance roles.",
                headers={"X-MFA-Required": "aal2"},
            )
        return current_user

    return role_checker


def require_mfa_aal2(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Explicitly requires MFA level aal2 regardless of route prefix."""
    if current_user.aal != "aal2":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Multi-factor authentication (aal2) is required for this operation.",
            headers={"X-MFA-Required": "aal2"},
        )
    return current_user


def require_dual_control(action_type: Optional[str] = None):
    """Enforces maker-checker dual control via an approved approval_requests record."""

    def dual_control_checker(
        request: Request,
        approval_request_id: Optional[str] = Query(default=None),
        current_user: CurrentUser = Depends(get_current_user),
    ) -> Dict[str, Any]:
        req_id = request.headers.get("X-Approval-Request-Id") or approval_request_id
        if not req_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "DUAL_CONTROL_REQUIRED",
                    "message": f"Dual-control approval is required for '{action_type or 'this action'}'. Provide X-Approval-Request-Id.",
                },
            )

        res = (
            supabase_admin.table("approval_requests")
            .select("*")
            .eq("id", req_id)
            .eq("school_id", current_user.school_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")

        approval = res.data[0]
        if action_type and approval.get("action_type") != action_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Approval request action_type '{approval.get('action_type')}' does not match '{action_type}'.",
            )

        if approval.get("status") != "approved":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval request must be in 'approved' state (current: '{approval.get('status')}').",
            )

        reviewed_by = approval.get("reviewed_by")
        requested_by = approval.get("requested_by")
        if not reviewed_by or reviewed_by == requested_by:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Segregation of duties violation: approval must be granted by a different reviewer.",
            )

        expires_at = _parse_iso_dt(approval.get("expires_at"))
        if expires_at and datetime.now(timezone.utc) > expires_at:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Approval request has expired.",
            )

        return approval

    return dual_control_checker
