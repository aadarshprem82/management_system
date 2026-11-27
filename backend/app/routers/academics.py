from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/academics", tags=["Academics"])


class AcademicYearCreate(BaseModel):
    name: str
    start_date: date
    end_date: date
    is_current: bool = False
    campus_id: Optional[str] = None


class ClassCreate(BaseModel):
    name: str
    numeric_level: Optional[int] = None
    campus_id: Optional[str] = None
    stream_id: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class SectionCreate(BaseModel):
    class_id: str
    name: str
    campus_id: Optional[str] = None
    room_id: Optional[str] = None
    max_capacity: Optional[int] = None


class SubjectCreate(BaseModel):
    name: str
    code: str
    campus_id: Optional[str] = None
    stream_id: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


@router.get("/academic-years")
def list_academic_years(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("academic_years")
        .select("*")
        .eq("school_id", user.school_id)
        .order("start_date", desc=True)
        .execute()
    )
    return res.data


@router.post("/academic-years", status_code=201)
def create_academic_year(
    payload: AcademicYearCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {
            **payload.model_dump(mode="json", exclude_none=True),
            "school_id": user.school_id,
        }
        res = supabase_admin.table("academic_years").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/classes")
def list_classes(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("classes")
        .select("*, sections(id, name)")
        .eq("school_id", user.school_id)
        .order("numeric_level")
        .execute()
    )
    return res.data


@router.post("/classes", status_code=201)
def create_class(
    payload: ClassCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(mode="json", exclude_none=True), "school_id": user.school_id}
        res = supabase_admin.table("classes").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/sections", status_code=201)
def create_section(
    payload: SectionCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(mode="json", exclude_none=True), "school_id": user.school_id}
        res = supabase_admin.table("sections").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/subjects")
def list_subjects(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("subjects")
        .select("*")
        .eq("school_id", user.school_id)
        .order("name")
        .execute()
    )
    return res.data


@router.post("/subjects", status_code=201)
def create_subject(
    payload: SubjectCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(mode="json", exclude_none=True), "school_id": user.school_id}
        res = supabase_admin.table("subjects").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))