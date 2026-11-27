from datetime import date
from fastapi import APIRouter, Depends
from app.core.auth import CurrentUser, get_current_user
from app.core.supabase import supabase_admin
from app.routers.assessments import compute_letter_grade

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


@router.get("/dashboard")
def get_dashboard_analytics(user: CurrentUser = Depends(get_current_user)):
    """Returns role-specific summary metrics for the dashboard."""
    notices_res = (
        supabase_admin.table("notices")
        .select("id", count="exact")
        .eq("school_id", user.school_id)
        .execute()
    )
    total_notices = notices_res.count or 0

    if user.role in (
        "super_admin",
        "admin",
        "principal",
        "teacher",
        "accountant",
        "auditor",
        "admissions_officer",
    ):
        students_res = (
            supabase_admin.table("profiles")
            .select("id", count="exact")
            .eq("school_id", user.school_id)
            .eq("role", "student")
            .execute()
        )
        teachers_res = (
            supabase_admin.table("profiles")
            .select("id", count="exact")
            .eq("school_id", user.school_id)
            .eq("role", "teacher")
            .execute()
        )
        classes_res = (
            supabase_admin.table("classes")
            .select("id", count="exact")
            .eq("school_id", user.school_id)
            .execute()
        )

        # Today's attendance rate
        today_str = date.today().isoformat()
        att_res = (
            supabase_admin.table("attendance")
            .select("status")
            .eq("school_id", user.school_id)
            .eq("date", today_str)
            .execute()
        )
        att_rows = att_res.data
        present_today = sum(1 for r in att_rows if r["status"] in ("present", "late"))
        today_att_pct = round((present_today / len(att_rows)) * 100, 1) if att_rows else None

        payload = {
            "role": user.role,
            "total_students": students_res.count or 0,
            "total_teachers": teachers_res.count or 0,
            "total_classes": classes_res.count or 0,
            "today_attendance_pct": today_att_pct,
            "total_notices": total_notices,
        }

        if user.role in ("super_admin", "admin", "principal", "accountant", "auditor"):
            payments_res = (
                supabase_admin.table("fee_payments")
                .select("amount_paid")
                .eq("school_id", user.school_id)
                .execute()
            )
            payload["total_fees_collected"] = round(
                sum(float(p["amount_paid"]) for p in payments_res.data), 2
            )

        return payload

    # Student / Parent view
    att_res = (
        supabase_admin.table("attendance")
        .select("status")
        .eq("school_id", user.school_id)
        .eq("student_id", user.id)
        .execute()
    )
    att_rows = att_res.data
    present_days = sum(1 for r in att_rows if r["status"] in ("present", "late"))
    att_pct = round((present_days / len(att_rows)) * 100, 1) if att_rows else 0.0

    marks_res = (
        supabase_admin.table("exam_marks")
        .select("marks_obtained, max_marks")
        .eq("school_id", user.school_id)
        .eq("student_id", user.id)
        .execute()
    )
    total_obt = sum(float(m["marks_obtained"]) for m in marks_res.data)
    total_max = sum(float(m["max_marks"]) for m in marks_res.data)
    overall_pct = round((total_obt / total_max) * 100, 1) if total_max > 0 else 0.0

    fees_res = (
        supabase_admin.table("fee_payments")
        .select("amount_paid")
        .eq("school_id", user.school_id)
        .eq("student_id", user.id)
        .execute()
    )
    total_paid = round(sum(float(f["amount_paid"]) for f in fees_res.data), 2)

    return {
        "role": user.role,
        "attendance_pct": att_pct,
        "overall_percentage": overall_pct,
        "overall_grade": compute_letter_grade(overall_pct) if marks_res.data else "N/A",
        "total_fees_paid": total_paid,
        "total_notices": total_notices,
    }