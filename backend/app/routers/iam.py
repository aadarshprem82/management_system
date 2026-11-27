from datetime import date, datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

from app.core.auth import (
    ALL_USER_ROLES,
    CurrentUser,
    get_current_user,
    require_dual_control,
    require_roles,
)
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/iam", tags=["IAM, MFA & Approvals"])

CURRENT_CONSENT_POLICY_KEY = "terms_and_privacy"
CURRENT_CONSENT_VERSION = "2026.1"

RoleLiteral = Literal[
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
]


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class RoleAssignmentInput(BaseModel):
    role: RoleLiteral
    campus_id: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_primary: bool = False


class InviteUserRequest(BaseModel):
    full_name: str = Field(min_length=2)
    email: EmailStr
    role: RoleLiteral = "teacher"
    campus_id: Optional[str] = None
    phone: Optional[str] = None
    mfa_enforced: bool = False
    temp_password: Optional[str] = None
    additional_roles: List[RoleAssignmentInput] = Field(default_factory=list)


class LifecycleActionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ConsentAcceptRequest(BaseModel):
    policy_key: str = CURRENT_CONSENT_POLICY_KEY
    version: str = CURRENT_CONSENT_VERSION
    channel: Literal["web", "mobile", "api", "in_person"] = "web"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ApprovalCreateRequest(BaseModel):
    action_type: str = Field(min_length=2, max_length=80)
    resource_type: str = Field(min_length=2, max_length=80)
    resource_id: Optional[str] = None
    campus_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(min_length=3, max_length=500)
    expires_at: Optional[datetime] = None


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    review_notes: Optional[str] = Field(default=None, max_length=500)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _revoke_supabase_sessions(user_id: str, ban: bool) -> None:
    """Bans/unbans user in Supabase Auth and revokes active sessions immediately."""
    try:
        supabase_admin.auth.admin.update_user_by_id(
            user_id,
            {"ban_duration": "876000h" if ban else "none"},
        )
    except Exception:
        pass

    if ban:
        try:
            supabase_admin.rpc("revoke_user_sessions", {"p_user_id": user_id}).execute()
        except Exception:
            pass


def _update_user_lifecycle(
    user_id: str,
    target_status: str,
    reason: str,
    actor: CurrentUser,
    ban: bool,
) -> Dict[str, Any]:
    if user_id == actor.id and target_status in ("suspended", "archived"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You cannot {target_status[:-2]} your own account.",
        )

    existing_res = (
        supabase_admin.table("profiles")
        .select("id, email, full_name, role, status")
        .eq("id", user_id)
        .eq("school_id", actor.school_id)
        .execute()
    )
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {
        "status": target_status,
        "status_reason": reason.strip(),
        "status_changed_at": now_iso,
        "status_changed_by": actor.id,
        "updated_at": now_iso,
    }
    if ban:
        updates["session_revoked_at"] = now_iso

    res = (
        supabase_admin.table("profiles")
        .update(updates)
        .eq("id", user_id)
        .eq("school_id", actor.school_id)
        .execute()
    )
    _revoke_supabase_sessions(user_id, ban=ban)
    return res.data[0]


# ---------------------------------------------------------------------------
# 1. Contexts & Consents (Accessible during session bootstrap)
# ---------------------------------------------------------------------------

@router.get("/contexts")
def get_my_contexts(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "user_id": current_user.id,
        "active_role": current_user.role,
        "primary_role": current_user.primary_role or current_user.role,
        "active_campus_id": current_user.active_campus_id,
        "aal": current_user.aal or "aal1",
        "mfa_required": current_user.mfa_required,
        "roles": [r.model_dump() for r in current_user.roles],
        "available_role_types": list(ALL_USER_ROLES),
    }


@router.get("/consents/me")
def get_my_consents(current_user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("user_consents")
        .select("*")
        .eq("school_id", current_user.school_id)
        .eq("user_id", current_user.id)
        .order("accepted_at", desc=True)
        .execute()
    )
    rows = res.data or []
    has_accepted = any(
        r.get("policy_key") == CURRENT_CONSENT_POLICY_KEY
        and r.get("version") == CURRENT_CONSENT_VERSION
        for r in rows
    )
    return {
        "policy_key": CURRENT_CONSENT_POLICY_KEY,
        "required_version": CURRENT_CONSENT_VERSION,
        "has_accepted_current": has_accepted,
        "consents": rows,
    }


@router.post("/consents/accept", status_code=201)
def accept_consent(
    payload: ConsentAcceptRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
):
    existing = (
        supabase_admin.table("user_consents")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("policy_key", payload.policy_key)
        .eq("version", payload.version)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    row = {
        "school_id": current_user.school_id,
        "user_id": current_user.id,
        "policy_key": payload.policy_key,
        "version": payload.version,
        "accepted_at": datetime.now(timezone.utc).isoformat(),
        "channel": payload.channel,
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("User-Agent"),
        "metadata": payload.metadata,
    }
    res = supabase_admin.table("user_consents").insert(row).execute()
    return res.data[0]


# ---------------------------------------------------------------------------
# 2. User Lifecycle (Invite / Suspend / Archive / Reinstate) & Multi-Role
# ---------------------------------------------------------------------------

@router.get("/users")
def list_iam_users(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    user: CurrentUser = Depends(
        require_roles(["admin", "super_admin", "principal", "auditor", "admissions_officer"])
    ),
):
    q = (
        supabase_admin.table("profiles")
        .select("id, full_name, email, role, phone, campus_id, status, status_reason, status_changed_at, mfa_enforced, created_at")
        .eq("school_id", user.school_id)
        .order("created_at", desc=True)
    )
    if status_filter:
        q = q.eq("status", status_filter)
    users = q.execute().data or []

    roles_res = (
        supabase_admin.table("user_roles")
        .select("id, user_id, role, campus_id, effective_from, effective_to, is_primary, is_active, campus:campuses(id, name, code)")
        .eq("school_id", user.school_id)
        .eq("is_active", True)
        .execute()
    )
    roles_by_user: Dict[str, List[dict]] = {}
    for r in roles_res.data or []:
        roles_by_user.setdefault(r["user_id"], []).append(r)

    for u in users:
        u["user_roles"] = roles_by_user.get(u["id"], [])
    return users


@router.post("/users/invite", status_code=201)
def invite_user(
    payload: InviteUserRequest,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal", "admissions_officer"])),
):
    auth_user_id: Optional[str] = None
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        if payload.temp_password:
            auth_res = supabase_admin.auth.admin.create_user(
                {
                    "email": payload.email,
                    "password": payload.temp_password,
                    "email_confirm": True,
                }
            )
            initial_status = "active"
        else:
            auth_res = supabase_admin.auth.admin.invite_user_by_email(
                payload.email,
                {"data": {"full_name": payload.full_name, "school_id": user.school_id}},
            )
            initial_status = "invited"

        auth_user_id = auth_res.user.id
        profile_data = {
            "id": auth_user_id,
            "school_id": user.school_id,
            "role": payload.role,
            "full_name": payload.full_name,
            "email": payload.email,
            "phone": payload.phone,
            "campus_id": payload.campus_id,
            "status": initial_status,
            "mfa_enforced": payload.mfa_enforced,
            "invited_at": now_iso,
            "invited_by": user.id,
        }
        profile_res = supabase_admin.table("profiles").insert(profile_data).execute()

        role_rows = [
            {
                "school_id": user.school_id,
                "user_id": auth_user_id,
                "role": payload.role,
                "campus_id": payload.campus_id,
                "is_primary": True,
                "is_active": True,
                "assigned_by": user.id,
                "effective_from": date.today().isoformat(),
            }
        ]
        for extra in payload.additional_roles:
            if extra.role == payload.role and extra.campus_id == payload.campus_id:
                continue
            role_rows.append(
                {
                    "school_id": user.school_id,
                    "user_id": auth_user_id,
                    "role": extra.role,
                    "campus_id": extra.campus_id,
                    "is_primary": False,
                    "is_active": True,
                    "assigned_by": user.id,
                    "effective_from": (extra.effective_from or date.today()).isoformat(),
                    "effective_to": extra.effective_to.isoformat() if extra.effective_to else None,
                }
            )
        supabase_admin.table("user_roles").insert(role_rows).execute()
        return {**profile_res.data[0], "user_roles": role_rows}
    except Exception as exc:
        if auth_user_id:
            try:
                supabase_admin.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/users/{user_id}/suspend")
def suspend_user(
    user_id: str,
    payload: LifecycleActionRequest,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal"])),
):
    return _update_user_lifecycle(user_id, "suspended", payload.reason, user, ban=True)


@router.post("/users/{user_id}/archive")
def archive_user(
    user_id: str,
    payload: LifecycleActionRequest,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal"])),
):
    return _update_user_lifecycle(user_id, "archived", payload.reason, user, ban=True)


@router.post("/users/{user_id}/reinstate")
def reinstate_user(
    user_id: str,
    payload: LifecycleActionRequest,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal"])),
):
    return _update_user_lifecycle(user_id, "active", payload.reason, user, ban=False)


@router.post("/users/{user_id}/roles", status_code=201)
def assign_user_role(
    user_id: str,
    payload: RoleAssignmentInput,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal"])),
):
    target_res = (
        supabase_admin.table("profiles")
        .select("id")
        .eq("id", user_id)
        .eq("school_id", user.school_id)
        .execute()
    )
    if not target_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.effective_to and payload.effective_from and payload.effective_to < payload.effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on or after effective_from")

    if payload.is_primary:
        supabase_admin.table("user_roles").update({"is_primary": False}).eq(
            "user_id", user_id
        ).eq("school_id", user.school_id).execute()
        supabase_admin.table("profiles").update({"role": payload.role}).eq(
            "id", user_id
        ).eq("school_id", user.school_id).execute()

    try:
        row = {
            "school_id": user.school_id,
            "user_id": user_id,
            "role": payload.role,
            "campus_id": payload.campus_id,
            "effective_from": (payload.effective_from or date.today()).isoformat(),
            "effective_to": payload.effective_to.isoformat() if payload.effective_to else None,
            "is_primary": payload.is_primary,
            "is_active": True,
            "assigned_by": user.id,
        }
        res = supabase_admin.table("user_roles").insert(row).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/users/{user_id}/roles/{assignment_id}", status_code=204)
def revoke_user_role(
    user_id: str,
    assignment_id: str,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal"])),
):
    supabase_admin.table("user_roles").update({"is_active": False}).eq(
        "id", assignment_id
    ).eq("user_id", user_id).eq("school_id", user.school_id).execute()


# ---------------------------------------------------------------------------
# 3. Approval Requests (Maker-Checker / Segregation of Duties)
# ---------------------------------------------------------------------------

@router.get("/approvals")
def list_approval_requests(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    action_type: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase_admin.table("approval_requests")
        .select("*")
        .eq("school_id", user.school_id)
        .order("created_at", desc=True)
    )
    if user.role not in ("admin", "super_admin", "principal", "accountant", "auditor"):
        q = q.eq("requested_by", user.id)
    if status_filter:
        q = q.eq("status", status_filter)
    if action_type:
        q = q.eq("action_type", action_type)
    return q.execute().data


@router.post("/approvals", status_code=201)
def create_approval_request(
    payload: ApprovalCreateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    row = {
        "school_id": user.school_id,
        "campus_id": payload.campus_id or user.active_campus_id,
        "action_type": payload.action_type,
        "resource_type": payload.resource_type,
        "resource_id": payload.resource_id,
        "payload": payload.payload,
        "reason": payload.reason.strip(),
        "status": "pending",
        "requested_by": user.id,
        "requested_role": user.role,
        "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
    }
    res = supabase_admin.table("approval_requests").insert(row).execute()
    return res.data[0]


@router.post("/approvals/{request_id}/decision")
def decide_approval_request(
    request_id: str,
    payload: ApprovalDecisionRequest,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal", "accountant"])),
):
    res = (
        supabase_admin.table("approval_requests")
        .select("*")
        .eq("id", request_id)
        .eq("school_id", user.school_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Approval request not found")

    req_row = res.data[0]
    if req_row.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Approval request is already '{req_row.get('status')}'.",
        )

    # Segregation of Duties: Maker cannot be Checker
    if req_row.get("requested_by") == user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Segregation of duties violation: you cannot approve or reject your own request.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    upd = (
        supabase_admin.table("approval_requests")
        .update(
            {
                "status": payload.decision,
                "reviewed_by": user.id,
                "reviewed_role": user.role,
                "review_notes": payload.review_notes,
                "reviewed_at": now_iso,
            }
        )
        .eq("id", request_id)
        .eq("school_id", user.school_id)
        .execute()
    )
    return upd.data[0]


@router.post("/approvals/{request_id}/execute")
def execute_approved_request(
    request_id: str,
    user: CurrentUser = Depends(require_roles(["admin", "super_admin", "principal", "accountant"])),
    approval: Dict[str, Any] = Depends(require_dual_control()),
):
    if approval["id"] != request_id:
        raise HTTPException(
            status_code=400,
            detail="X-Approval-Request-Id header does not match target approval request ID.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    upd = (
        supabase_admin.table("approval_requests")
        .update({"status": "executed", "executed_at": now_iso})
        .eq("id", request_id)
        .eq("school_id", user.school_id)
        .execute()
    )
    return {
        "executed": True,
        "executed_by": user.id,
        "approval": upd.data[0] if upd.data else approval,
    }
