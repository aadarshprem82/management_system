from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/assessments", tags=["Exams & Assignments"])


def compute_letter_grade(percentage: float) -> str:
    if percentage >= 90:
        return "A+"
    if percentage >= 80:
        return "A"
    if percentage >= 70:
        return "B"
    if percentage >= 60:
        return "C"
    if percentage >= 50:
        return "D"
    return "F"


class ExamCreate(BaseModel):
    academic_year_id: str
    class_id: str
    name: str
    start_date: date
    end_date: date


class MarkEntry(BaseModel):
    student_id: str
    marks_obtained: float = Field(ge=0)
    max_marks: float = Field(gt=0, default=100)
    remarks: Optional[str] = None


class BulkMarksRequest(BaseModel):
    exam_id: str
    subject_id: str
    records: List[MarkEntry]


class AssignmentCreate(BaseModel):
    class_id: str
    section_id: str
    subject_id: str
    title: str
    description: Optional[str] = None
    due_date: date
    file_url: Optional[str] = None


class SubmissionCreate(BaseModel):
    file_url: str
    remarks: Optional[str] = None


@router.get("/exams")
def list_exams(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("exams")
        .select("*, academic_year:academic_years(id, name), class:classes(id, name)")
        .eq("school_id", user.school_id)
        .order("start_date", desc=True)
        .execute()
    )
    return res.data


@router.post("/exams", status_code=201)
def create_exam(
    payload: ExamCreate,
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    try:
        data = {**payload.model_dump(mode="json"), "school_id": user.school_id}
        res = supabase_admin.table("exams").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/marks/roster")
def get_marks_roster(
    exam_id: str = Query(...),
    academic_year_id: str = Query(...),
    class_id: str = Query(...),
    section_id: str = Query(...),
    subject_id: str = Query(...),
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    enrollments = (
        supabase_admin.table("enrollments")
        .select("student_id, roll_number, student:profiles(id, full_name)")
        .eq("school_id", user.school_id)
        .eq("academic_year_id", academic_year_id)
        .eq("class_id", class_id)
        .eq("section_id", section_id)
        .order("roll_number")
        .execute()
    ).data

    existing_marks = (
        supabase_admin.table("exam_marks")
        .select("student_id, marks_obtained, max_marks, remarks")
        .eq("school_id", user.school_id)
        .eq("exam_id", exam_id)
        .eq("subject_id", subject_id)
        .execute()
    ).data
    marks_map = {m["student_id"]: m for m in existing_marks}

    roster = []
    for en in enrollments:
        sid = en["student_id"]
        saved = marks_map.get(sid)
        roster.append(
            {
                "student_id": sid,
                "roll_number": en.get("roll_number"),
                "full_name": en["student"]["full_name"] if en.get("student") else "Unknown",
                "marks_obtained": saved["marks_obtained"] if saved else "",
                "max_marks": saved["max_marks"] if saved else 100,
                "remarks": saved["remarks"] if saved and saved["remarks"] else "",
            }
        )
    return roster


@router.post("/marks/bulk")
def save_bulk_marks(
    payload: BulkMarksRequest,
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    if not payload.records:
        raise HTTPException(status_code=400, detail="No marks provided")

    rows = [
        {
            "school_id": user.school_id,
            "exam_id": payload.exam_id,
            "subject_id": payload.subject_id,
            "student_id": r.student_id,
            "marks_obtained": r.marks_obtained,
            "max_marks": r.max_marks,
            "remarks": r.remarks or None,
            "graded_by": user.id,
        }
        for r in payload.records
    ]

    try:
        res = (
            supabase_admin.table("exam_marks")
            .upsert(rows, on_conflict="exam_id,subject_id,student_id")
            .execute()
        )
        return {"saved_count": len(res.data)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/my-report-card")
def get_my_report_card(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("exam_marks")
        .select("id, marks_obtained, max_marks, remarks, exam:exams(id, name), subject:subjects(id, name, code)")
        .eq("school_id", user.school_id)
        .eq("student_id", user.id)
        .execute()
    )
    items = []
    total_obtained = 0.0
    total_max = 0.0

    for row in res.data:
        obtained = float(row["marks_obtained"])
        maximum = float(row["max_marks"])
        pct = round((obtained / maximum) * 100, 1) if maximum > 0 else 0.0
        total_obtained += obtained
        total_max += maximum
        items.append(
            {
                "id": row["id"],
                "exam_name": row["exam"]["name"] if row.get("exam") else "Exam",
                "subject_name": row["subject"]["name"] if row.get("subject") else "Subject",
                "subject_code": row["subject"]["code"] if row.get("subject") else "",
                "marks_obtained": obtained,
                "max_marks": maximum,
                "percentage": pct,
                "grade": compute_letter_grade(pct),
                "remarks": row.get("remarks"),
            }
        )

    overall_pct = round((total_obtained / total_max) * 100, 1) if total_max > 0 else 0.0
    return {
        "overall_percentage": overall_pct,
        "overall_grade": compute_letter_grade(overall_pct) if items else "N/A",
        "items": items,
    }


@router.get("/assignments")
def list_assignments(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("assignments")
        .select(
            "*, class:classes(id, name), section:sections(id, name), "
            "subject:subjects(id, name, code), teacher:profiles(id, full_name)"
        )
        .eq("school_id", user.school_id)
        .order("due_date", desc=True)
        .execute()
    )
    return res.data


@router.post("/assignments", status_code=201)
def create_assignment(
    payload: AssignmentCreate,
    user: CurrentUser = Depends(require_roles(["admin", "teacher"])),
):
    try:
        data = {
            **payload.model_dump(mode="json"),
            "school_id": user.school_id,
            "teacher_id": user.id,
        }
        res = supabase_admin.table("assignments").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/assignments/{assignment_id}/submit", status_code=201)
def submit_assignment(
    assignment_id: str,
    payload: SubmissionCreate,
    user: CurrentUser = Depends(require_roles(["student"])),
):
    try:
        data = {
            "school_id": user.school_id,
            "assignment_id": assignment_id,
            "student_id": user.id,
            "file_url": payload.file_url,
            "remarks": payload.remarks,
        }
        res = (
            supabase_admin.table("assignment_submissions")
            .upsert(data, on_conflict="assignment_id,student_id")
            .execute()
        )
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))