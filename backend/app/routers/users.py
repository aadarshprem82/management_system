from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/users", tags=["Users & Enrollments"])


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: Literal["admin", "teacher", "student", "parent"]
    phone: Optional[str] = None


class EnrollmentCreate(BaseModel):
    student_id: str
    academic_year_id: str
    class_id: str
    section_id: str
    roll_number: Optional[str] = None


@router.get("")
def list_users(
    role: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    query = (
        supabase_admin.table("profiles")
        .select("id, full_name, email, role, phone, created_at")
        .eq("school_id", user.school_id)
        .order("created_at", desc=True)
    )
    if role:
        query = query.eq("role", role)
    return query.execute().data


@router.post("", status_code=201)
def create_user(
    payload: UserCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    auth_user_id: Optional[str] = None
    try:        
        auth_res = supabase_admin.auth.admin.create_user(
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
            }
        )
        auth_user_id = auth_res.user.id
        
        profile_data = {
            "id": auth_user_id,
            "school_id": user.school_id,
            "role": payload.role,
            "full_name": payload.full_name,
            "email": payload.email,
            "phone": payload.phone,
        }
        profile_res = supabase_admin.table("profiles").insert(profile_data).execute()
        return profile_res.data[0]
    except Exception as exc:        
        if auth_user_id:
            try:
                supabase_admin.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/enrollments")
def list_enrollments(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("enrollments")
        .select(
            "id, roll_number, "
            "student:profiles(id, full_name, email), "
            "academic_year:academic_years(id, name), "
            "class:classes(id, name), "
            "section:sections(id, name)"
        )
        .eq("school_id", user.school_id)
        .execute()
    )
    return res.data


@router.post("/enrollments", status_code=201)
def create_enrollment(
    payload: EnrollmentCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(), "school_id": user.school_id}
        res = supabase_admin.table("enrollments").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))