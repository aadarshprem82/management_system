from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/notices", tags=["Notice Board"])


class NoticeCreate(BaseModel):
    title: str
    content: str
    class_id: Optional[str] = None  # None = School-wide
    is_pinned: bool = False


@router.get("")
def list_notices(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("notices")
        .select(
            "id, title, content, is_pinned, created_at, class_id, "
            "class:classes(id, name), "
            "author:profiles!notices_posted_by_fkey(id, full_name, role)"
        )
        .eq("school_id", user.school_id)
        .order("is_pinned", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data


@router.post("", status_code=201)
def create_notice(
    payload: NoticeCreate,
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    try:
        data = {
            "school_id": user.school_id,
            "title": payload.title,
            "content": payload.content,
            "class_id": payload.class_id or None,
            "is_pinned": payload.is_pinned,
            "posted_by": user.id,
        }
        res = supabase_admin.table("notices").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{notice_id}", status_code=204)
def delete_notice(
    notice_id: str,
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    try:
        supabase_admin.table("notices").delete().eq("id", notice_id).eq(
            "school_id", user.school_id
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))