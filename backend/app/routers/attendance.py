from datetime import date
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/attendance", tags=["Attendance"])


class AttendanceEntry(BaseModel):
    student_id: str
    status: Literal["present", "absent", "late", "excused"]
    remarks: Optional[str] = None


class BulkAttendanceRequest(BaseModel):
    academic_year_id: str
    class_id: str
    section_id: str
    date: date
    records: List[AttendanceEntry]


@router.get("/roster")
def get_attendance_roster(
    academic_year_id: str = Query(...),
    class_id: str = Query(...),
    section_id: str = Query(...),
    attendance_date: date = Query(..., alias="date"),
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    # Returns enrolled students in a section paired with their attendance for the given date.
    enrollments_res = (
        supabase_admin.table("enrollments")
        .select("student_id, roll_number, student:profiles(id, full_name, email)")
        .eq("school_id", user.school_id)
        .eq("academic_year_id", academic_year_id)
        .eq("class_id", class_id)
        .eq("section_id", section_id)
        .order("roll_number")
        .execute()
    )

    existing_res = (
        supabase_admin.table("attendance")
        .select("student_id, status, remarks")
        .eq("school_id", user.school_id)
        .eq("section_id", section_id)
        .eq("date", attendance_date.isoformat())
        .execute()
    )
    existing_map = {row["student_id"]: row for row in existing_res.data}

    roster = []
    for en in enrollments_res.data:
        sid = en["student_id"]
        saved = existing_map.get(sid)
        roster.append(
            {
                "student_id": sid,
                "roll_number": en.get("roll_number"),
                "full_name": en["student"]["full_name"] if en.get("student") else "Unknown",
                "status": saved["status"] if saved else "present",
                "remarks": saved["remarks"] if saved else "",
                "is_marked": saved is not None,
            }
        )
    return roster


@router.post("/bulk", status_code=200)
def save_bulk_attendance(
    payload: BulkAttendanceRequest,
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    # Upserts daily attendance records for an entire section.
    if not payload.records:
        raise HTTPException(status_code=400, detail="No attendance records provided")

    rows = [
        {
            "school_id": user.school_id,
            "academic_year_id": payload.academic_year_id,
            "class_id": payload.class_id,
            "section_id": payload.section_id,
            "student_id": rec.student_id,
            "date": payload.date.isoformat(),
            "status": rec.status,
            "remarks": rec.remarks or None,
            "marked_by": user.id,
        }
        for rec in payload.records
    ]

    try:
        res = (
            supabase_admin.table("attendance")
            .upsert(rows, on_conflict="student_id,date")
            .execute()
        )
        return {"saved_count": len(res.data)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/my-summary")
def get_my_attendance_summary(user: CurrentUser = Depends(get_current_user)):
    # Returns attendance history and percentage for the logged-in student.
    res = (
        supabase_admin.table("attendance")
        .select("id, date, status, remarks")
        .eq("school_id", user.school_id)
        .eq("student_id", user.id)
        .order("date", desc=True)
        .execute()
    )
    records = res.data
    total = len(records)
    present = sum(1 for r in records if r["status"] == "present")
    late = sum(1 for r in records if r["status"] == "late")
    absent = sum(1 for r in records if r["status"] == "absent")
    excused = sum(1 for r in records if r["status"] == "excused")
    percentage = round(((present + late) / total) * 100, 1) if total > 0 else 0.0

    return {
        "total_days": total,
        "present": present,
        "late": late,
        "absent": absent,
        "excused": excused,
        "percentage": percentage,
        "records": records,
    }