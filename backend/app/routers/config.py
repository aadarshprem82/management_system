from datetime import date, timedelta
from typing import Any, Dict, List, Literal, Optional
from zoneinfo import available_timezones
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.feature_flags import DEFAULT_MODULES, get_effective_module_flags
from app.core.sequences import generate_sequence_number
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/config", tags=["Organization & Configuration"])

VALID_TIMEZONES = available_timezones()


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None
    tagline: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    primary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    secondary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    timezone: Optional[str] = None
    currency_code: Optional[str] = Field(default=None, min_length=3, max_length=3)
    currency_symbol: Optional[str] = Field(default=None, min_length=1, max_length=5)


class CampusCreate(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: bool = False
    is_active: bool = True


class CampusUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None


class TermCreate(BaseModel):
    academic_year_id: str
    campus_id: Optional[str] = None
    name: str
    code: Optional[str] = None
    start_date: date
    end_date: date
    sequence_order: int = Field(default=1, ge=1)
    is_current: bool = False
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class TermUpdate(BaseModel):
    campus_id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sequence_order: Optional[int] = Field(default=None, ge=1)
    is_current: Optional[bool] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class CalendarDayCreate(BaseModel):
    campus_id: Optional[str] = None
    academic_year_id: Optional[str] = None
    term_id: Optional[str] = None
    day_date: date
    day_type: Literal["holiday", "closure", "special_schedule", "exam_day", "event"]
    title: str
    description: Optional[str] = None
    is_working_day: bool = False
    schedule_override: Optional[Dict[str, Any]] = None
    reject_on_conflict: bool = False


class CalendarDayUpdate(BaseModel):
    campus_id: Optional[str] = None
    academic_year_id: Optional[str] = None
    term_id: Optional[str] = None
    day_date: Optional[date] = None
    day_type: Optional[Literal["holiday", "closure", "special_schedule", "exam_day", "event"]] = None
    title: Optional[str] = None
    description: Optional[str] = None
    is_working_day: Optional[bool] = None
    schedule_override: Optional[Dict[str, Any]] = None


class RoomCreate(BaseModel):
    campus_id: Optional[str] = None
    name: str
    code: str
    building: Optional[str] = None
    floor: Optional[str] = None
    room_type: Literal["classroom", "lab", "auditorium", "library", "sports", "office", "other"] = "classroom"
    capacity: int = Field(gt=0)
    exam_capacity: Optional[int] = Field(default=None, gt=0)
    facilities: List[str] = Field(default_factory=list)
    is_active: bool = True


class RoomUpdate(BaseModel):
    campus_id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    room_type: Optional[Literal["classroom", "lab", "auditorium", "library", "sports", "office", "other"]] = None
    capacity: Optional[int] = Field(default=None, gt=0)
    exam_capacity: Optional[int] = Field(default=None, gt=0)
    facilities: Optional[List[str]] = None
    is_active: Optional[bool] = None


class RoomCapacityCheckRequest(BaseModel):
    room_id: str
    requested_count: Optional[int] = Field(default=None, ge=0)
    section_id: Optional[str] = None
    academic_year_id: Optional[str] = None
    mode: Literal["regular", "exam"] = "regular"


class StreamCreate(BaseModel):
    campus_id: Optional[str] = None
    name: str
    code: str
    description: Optional[str] = None
    is_active: bool = True


class StreamUpdate(BaseModel):
    campus_id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class HouseCreate(BaseModel):
    campus_id: Optional[str] = None
    name: str
    code: str
    color: str = Field(default="#1976d2", pattern=r"^#[0-9a-fA-F]{6}$")
    motto: Optional[str] = None
    is_active: bool = True


class HouseUpdate(BaseModel):
    campus_id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    motto: Optional[str] = None
    is_active: Optional[bool] = None


class SequenceCreate(BaseModel):
    campus_id: Optional[str] = None
    academic_year_id: Optional[str] = None
    sequence_type: str = Field(min_length=2, max_length=40)
    prefix: str = Field(min_length=1, max_length=20)
    suffix: str = Field(default="", max_length=20)
    separator: str = Field(default="-", max_length=5)
    padding: int = Field(default=4, ge=1, le=12)
    next_number: int = Field(default=1, ge=1)
    reset_policy: Literal["never", "yearly", "monthly"] = "never"
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: bool = True


class SequenceUpdate(BaseModel):
    prefix: Optional[str] = Field(default=None, min_length=1, max_length=20)
    suffix: Optional[str] = Field(default=None, max_length=20)
    separator: Optional[str] = Field(default=None, max_length=5)
    padding: Optional[int] = Field(default=None, ge=1, le=12)
    next_number: Optional[int] = Field(default=None, ge=1)
    reset_policy: Optional[Literal["never", "yearly", "monthly"]] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: Optional[bool] = None


class SequenceNextRequest(BaseModel):
    sequence_type: str
    campus_id: Optional[str] = None
    academic_year_id: Optional[str] = None
    as_of_date: Optional[date] = None


class FeatureFlagUpdate(BaseModel):
    is_enabled: bool
    campus_id: Optional[str] = None
    description: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class YearCloneRequest(BaseModel):
    target_name: str = Field(min_length=2)
    target_start_date: date
    target_end_date: date
    target_is_current: bool = False
    campus_id: Optional[str] = None
    include_terms: bool = True
    include_calendar_days: bool = True
    include_fee_structures: bool = True
    include_sequences: bool = True
    include_exams: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_timezone(tz: Optional[str]) -> None:
    if tz is not None and tz not in VALID_TIMEZONES:
        raise HTTPException(status_code=400, detail=f"Invalid IANA timezone: '{tz}'")


def _detect_calendar_conflicts(
    school_id: str,
    day_date: date,
    day_type: str,
    is_working_day: bool,
    campus_id: Optional[str] = None,
    academic_year_id: Optional[str] = None,
    term_id: Optional[str] = None,
    exclude_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Detects overlapping calendar entries, exams, fee due dates, and out-of-range bounds."""
    conflicts: List[Dict[str, Any]] = []
    day_iso = day_date.isoformat()

    # 1. Existing calendar_days on the same date
    existing_res = (
        supabase_admin.table("calendar_days")
        .select("id, campus_id, day_type, title, is_working_day")
        .eq("school_id", school_id)
        .eq("day_date", day_iso)
        .execute()
    )
    for row in existing_res.data or []:
        if exclude_id and row["id"] == exclude_id:
            continue
        row_campus = row.get("campus_id")
        if row_campus is None or campus_id is None or row_campus == campus_id:
            scope_note = "school-wide" if row_campus is None else "same campus"
            conflicts.append(
                {
                    "severity": "warning",
                    "category": "calendar_overlap",
                    "message": f"Overlaps with existing {row['day_type']} '{row['title']}' ({scope_note}) on {day_iso}.",
                    "entity_id": row["id"],
                }
            )

    # 2. Non-working holiday/closure vs scheduled exams or fee due dates
    if day_type in ("holiday", "closure") or not is_working_day:
        exams_res = (
            supabase_admin.table("exams")
            .select("id, name, start_date, end_date, campus_id")
            .eq("school_id", school_id)
            .lte("start_date", day_iso)
            .gte("end_date", day_iso)
            .execute()
        )
        for ex in exams_res.data or []:
            ex_campus = ex.get("campus_id")
            if ex_campus is None or campus_id is None or ex_campus == campus_id:
                conflicts.append(
                    {
                        "severity": "warning",
                        "category": "exam_conflict",
                        "message": f"Scheduled exam '{ex['name']}' ({ex['start_date']} to {ex['end_date']}) falls on {day_iso}.",
                        "entity_id": ex["id"],
                    }
                )

        fees_res = (
            supabase_admin.table("fee_structures")
            .select("id, name, due_date, campus_id")
            .eq("school_id", school_id)
            .eq("due_date", day_iso)
            .execute()
        )
        for fs in fees_res.data or []:
            fs_campus = fs.get("campus_id")
            if fs_campus is None or campus_id is None or fs_campus == campus_id:
                conflicts.append(
                    {
                        "severity": "warning",
                        "category": "fee_due_date_conflict",
                        "message": f"Fee due date for '{fs['name']}' falls on non-working day {day_iso}.",
                        "entity_id": fs["id"],
                    }
                )

    # 3. Academic year and term date boundaries
    if academic_year_id:
        year_res = (
            supabase_admin.table("academic_years")
            .select("id, name, start_date, end_date")
            .eq("school_id", school_id)
            .eq("id", academic_year_id)
            .execute()
        )
        if year_res.data:
            yr = year_res.data[0]
            if day_iso < str(yr["start_date"]) or day_iso > str(yr["end_date"]):
                conflicts.append(
                    {
                        "severity": "warning",
                        "category": "academic_year_bounds",
                        "message": f"Date {day_iso} is outside academic year '{yr['name']}' ({yr['start_date']} to {yr['end_date']}).",
                        "entity_id": yr["id"],
                    }
                )

    if term_id:
        term_res = (
            supabase_admin.table("terms")
            .select("id, name, start_date, end_date")
            .eq("school_id", school_id)
            .eq("id", term_id)
            .execute()
        )
        if term_res.data:
            tm = term_res.data[0]
            if day_iso < str(tm["start_date"]) or day_iso > str(tm["end_date"]):
                conflicts.append(
                    {
                        "severity": "warning",
                        "category": "term_bounds",
                        "message": f"Date {day_iso} is outside term '{tm['name']}' ({tm['start_date']} to {tm['end_date']}).",
                        "entity_id": tm["id"],
                    }
                )

    return conflicts


def _evaluate_room_capacity(
    school_id: str,
    room_id: str,
    requested_count: Optional[int] = None,
    section_id: Optional[str] = None,
    academic_year_id: Optional[str] = None,
    mode: str = "regular",
) -> Dict[str, Any]:
    room_res = (
        supabase_admin.table("rooms")
        .select("*")
        .eq("school_id", school_id)
        .eq("id", room_id)
        .execute()
    )
    if not room_res.data:
        raise HTTPException(status_code=404, detail="Room not found")

    room = room_res.data[0]
    count = requested_count

    if count is None and section_id:
        en_q = (
            supabase_admin.table("enrollments")
            .select("id", count="exact")
            .eq("school_id", school_id)
            .eq("section_id", section_id)
        )
        if academic_year_id:
            en_q = en_q.eq("academic_year_id", academic_year_id)
        en_res = en_q.execute()
        count = en_res.count if en_res.count is not None else len(en_res.data or [])

    if count is None:
        count = 0

    max_cap = int(room["exam_capacity"] or room["capacity"]) if mode == "exam" else int(room["capacity"])
    fits = count <= max_cap
    remaining = max_cap - count
    overflow = max(0, count - max_cap)
    utilization_pct = round((count / max_cap) * 100, 1) if max_cap > 0 else 0.0

    warning = None
    if not fits:
        warning = f"Room '{room['name']}' {mode} capacity ({max_cap}) exceeded by {overflow} student(s)."
    elif utilization_pct >= 90.0:
        warning = f"Room '{room['name']}' is near capacity ({utilization_pct}% utilized)."

    return {
        "room_id": room["id"],
        "room_name": room["name"],
        "room_code": room["code"],
        "mode": mode,
        "max_capacity": max_cap,
        "requested_count": count,
        "fits": fits,
        "remaining_capacity": remaining,
        "overflow": overflow,
        "utilization_pct": utilization_pct,
        "warning": warning,
    }


def _shift_date(orig_iso: str, src_start: date, tgt_start: date) -> str:
    orig = date.fromisoformat(str(orig_iso)[:10])
    if src_start.month == tgt_start.month and src_start.day == tgt_start.day:
        year_delta = tgt_start.year - src_start.year
        target_year = orig.year + year_delta
        try:
            return orig.replace(year=target_year).isoformat()
        except ValueError:
            # Handle Feb 29 -> Feb 28 in non-leap years
            return orig.replace(year=target_year, day=28).isoformat()
    day_delta = (tgt_start - src_start).days
    return (orig + timedelta(days=day_delta)).isoformat()


def _build_year_clone_plan(
    school_id: str,
    source_year_id: str,
    payload: YearCloneRequest,
) -> Dict[str, Any]:
    if payload.target_end_date < payload.target_start_date:
        raise HTTPException(status_code=400, detail="target_end_date must be on or after target_start_date")

    src_res = (
        supabase_admin.table("academic_years")
        .select("*")
        .eq("school_id", school_id)
        .eq("id", source_year_id)
        .execute()
    )
    if not src_res.data:
        raise HTTPException(status_code=404, detail="Source academic year not found")
    source_year = src_res.data[0]
    src_start = date.fromisoformat(str(source_year["start_date"])[:10])

    existing_target = (
        supabase_admin.table("academic_years")
        .select("id, name")
        .eq("school_id", school_id)
        .eq("name", payload.target_name)
        .execute()
    )
    warnings: List[str] = []
    if existing_target.data:
        warnings.append(f"Academic year '{payload.target_name}' already exists.")

    effective_campus = payload.campus_id if payload.campus_id is not None else source_year.get("campus_id")

    terms_to_clone: List[Dict[str, Any]] = []
    if payload.include_terms:
        t_res = (
            supabase_admin.table("terms")
            .select("*")
            .eq("school_id", school_id)
            .eq("academic_year_id", source_year_id)
            .order("sequence_order")
            .execute()
        )
        for t in t_res.data or []:
            terms_to_clone.append(
                {
                    "source_id": t["id"],
                    "name": t["name"],
                    "code": t.get("code"),
                    "campus_id": t.get("campus_id") or effective_campus,
                    "source_start_date": t["start_date"],
                    "source_end_date": t["end_date"],
                    "start_date": _shift_date(t["start_date"], src_start, payload.target_start_date),
                    "end_date": _shift_date(t["end_date"], src_start, payload.target_start_date),
                    "sequence_order": t.get("sequence_order", 1),
                    "is_current": False,
                    "effective_from": payload.target_start_date.isoformat(),
                    "effective_to": payload.target_end_date.isoformat(),
                }
            )

    calendar_days_to_clone: List[Dict[str, Any]] = []
    if payload.include_calendar_days:
        c_res = (
            supabase_admin.table("calendar_days")
            .select("*")
            .eq("school_id", school_id)
            .eq("academic_year_id", source_year_id)
            .order("day_date")
            .execute()
        )
        for c in c_res.data or []:
            calendar_days_to_clone.append(
                {
                    "source_id": c["id"],
                    "title": c["title"],
                    "day_type": c["day_type"],
                    "campus_id": c.get("campus_id") or effective_campus,
                    "source_day_date": c["day_date"],
                    "day_date": _shift_date(c["day_date"], src_start, payload.target_start_date),
                    "description": c.get("description"),
                    "is_working_day": c.get("is_working_day", False),
                    "schedule_override": c.get("schedule_override"),
                }
            )

    fee_structures_to_clone: List[Dict[str, Any]] = []
    fee_res = (
        supabase_admin.table("fee_structures")
        .select("*")
        .eq("school_id", school_id)
        .eq("academic_year_id", source_year_id)
        .execute()
    )
    source_fee_rows = fee_res.data or []
    if payload.include_fee_structures:
        for fs in source_fee_rows:
            fee_structures_to_clone.append(
                {
                    "source_id": fs["id"],
                    "class_id": fs["class_id"],
                    "campus_id": fs.get("campus_id") or effective_campus,
                    "name": fs["name"],
                    "amount": float(fs["amount"]),
                    "source_due_date": fs["due_date"],
                    "due_date": _shift_date(fs["due_date"], src_start, payload.target_start_date),
                    "effective_from": payload.target_start_date.isoformat(),
                    "effective_to": payload.target_end_date.isoformat(),
                    "version": 1,
                }
            )

    sequences_to_clone: List[Dict[str, Any]] = []
    if payload.include_sequences:
        seq_res = (
            supabase_admin.table("numbering_sequences")
            .select("*")
            .eq("school_id", school_id)
            .eq("academic_year_id", source_year_id)
            .eq("is_active", True)
            .execute()
        )
        for sq in seq_res.data or []:
            sequences_to_clone.append(
                {
                    "source_id": sq["id"],
                    "campus_id": sq.get("campus_id") or effective_campus,
                    "sequence_type": sq["sequence_type"],
                    "prefix": sq["prefix"],
                    "suffix": sq.get("suffix", ""),
                    "separator": sq.get("separator", "-"),
                    "padding": sq.get("padding", 4),
                    "next_number": 1,
                    "reset_policy": sq.get("reset_policy", "yearly"),
                    "effective_from": payload.target_start_date.isoformat(),
                    "effective_to": payload.target_end_date.isoformat(),
                    "is_active": True,
                }
            )

    exams_to_clone: List[Dict[str, Any]] = []
    exam_res = (
        supabase_admin.table("exams")
        .select("*")
        .eq("school_id", school_id)
        .eq("academic_year_id", source_year_id)
        .execute()
    )
    source_exam_rows = exam_res.data or []
    if payload.include_exams:
        for ex in source_exam_rows:
            exams_to_clone.append(
                {
                    "source_id": ex["id"],
                    "class_id": ex["class_id"],
                    "campus_id": ex.get("campus_id") or effective_campus,
                    "name": ex["name"],
                    "source_start_date": ex["start_date"],
                    "source_end_date": ex["end_date"],
                    "start_date": _shift_date(ex["start_date"], src_start, payload.target_start_date),
                    "end_date": _shift_date(ex["end_date"], src_start, payload.target_start_date),
                }
            )

    # Count student transactions in source year strictly to verify they are excluded
    en_res = (
        supabase_admin.table("enrollments")
        .select("id", count="exact")
        .eq("school_id", school_id)
        .eq("academic_year_id", source_year_id)
        .execute()
    )
    att_res = (
        supabase_admin.table("attendance")
        .select("id", count="exact")
        .eq("school_id", school_id)
        .eq("academic_year_id", source_year_id)
        .execute()
    )
    fee_ids = [f["id"] for f in source_fee_rows]
    pay_count = 0
    if fee_ids:
        pay_res = (
            supabase_admin.table("fee_payments")
            .select("id", count="exact")
            .eq("school_id", school_id)
            .in_("fee_structure_id", fee_ids)
            .execute()
        )
        pay_count = pay_res.count if pay_res.count is not None else len(pay_res.data or [])

    exam_ids = [e["id"] for e in source_exam_rows]
    marks_count = 0
    if exam_ids:
        mk_res = (
            supabase_admin.table("exam_marks")
            .select("id", count="exact")
            .eq("school_id", school_id)
            .in_("exam_id", exam_ids)
            .execute()
        )
        marks_count = mk_res.count if mk_res.count is not None else len(mk_res.data or [])

    return {
        "source_year": {
            "id": source_year["id"],
            "name": source_year["name"],
            "start_date": source_year["start_date"],
            "end_date": source_year["end_date"],
        },
        "target_year": {
            "name": payload.target_name,
            "start_date": payload.target_start_date.isoformat(),
            "end_date": payload.target_end_date.isoformat(),
            "is_current": payload.target_is_current,
            "campus_id": effective_campus,
        },
        "warnings": warnings,
        "has_conflicts": len(warnings) > 0,
        "records_to_clone": {
            "terms": terms_to_clone,
            "calendar_days": calendar_days_to_clone,
            "fee_structures": fee_structures_to_clone,
            "numbering_sequences": sequences_to_clone,
            "exams": exams_to_clone,
        },
        "counts": {
            "terms": len(terms_to_clone),
            "calendar_days": len(calendar_days_to_clone),
            "fee_structures": len(fee_structures_to_clone),
            "numbering_sequences": len(sequences_to_clone),
            "exams": len(exams_to_clone),
        },
        "excluded_student_transactions": {
            "enrollments": en_res.count if en_res.count is not None else len(en_res.data or []),
            "attendance": att_res.count if att_res.count is not None else len(att_res.data or []),
            "fee_payments": pay_count,
            "exam_marks": marks_count,
            "copied": 0,
        },
    }


# ---------------------------------------------------------------------------
# 1. Organization Branding / Timezone / Currency
# ---------------------------------------------------------------------------

@router.get("/organization")
def get_organization_config(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("schools")
        .select("*")
        .eq("id", user.school_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return res.data


@router.put("/organization")
def update_organization_config(
    payload: OrganizationUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    _validate_timezone(payload.timezone)
    updates = payload.model_dump(exclude_none=True)
    if "currency_code" in updates:
        updates["currency_code"] = updates["currency_code"].upper()
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    try:
        res = (
            supabase_admin.table("schools")
            .update(updates)
            .eq("id", user.school_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Organization not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# 2. Campuses
# ---------------------------------------------------------------------------

@router.get("/campuses")
def list_campuses(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("campuses")
        .select("*")
        .eq("school_id", user.school_id)
        .order("is_primary", desc=True)
        .order("name")
        .execute()
    )
    return res.data


@router.post("/campuses", status_code=201)
def create_campus(
    payload: CampusCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    _validate_timezone(payload.timezone)
    try:
        if payload.is_primary:
            supabase_admin.table("campuses").update({"is_primary": False}).eq(
                "school_id", user.school_id
            ).execute()
        data = {**payload.model_dump(), "school_id": user.school_id}
        res = supabase_admin.table("campuses").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/campuses/{campus_id}")
def update_campus(
    campus_id: str,
    payload: CampusUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    _validate_timezone(payload.timezone)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    try:
        if updates.get("is_primary"):
            supabase_admin.table("campuses").update({"is_primary": False}).eq(
                "school_id", user.school_id
            ).execute()
        res = (
            supabase_admin.table("campuses")
            .update(updates)
            .eq("id", campus_id)
            .eq("school_id", user.school_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Campus not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/campuses/{campus_id}", status_code=204)
def delete_campus(
    campus_id: str,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    supabase_admin.table("campuses").delete().eq("id", campus_id).eq(
        "school_id", user.school_id
    ).execute()


# ---------------------------------------------------------------------------
# 3. Terms
# ---------------------------------------------------------------------------

@router.get("/terms")
def list_terms(
    academic_year_id: Optional[str] = Query(default=None),
    campus_id: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    query = (
        supabase_admin.table("terms")
        .select("*, academic_year:academic_years(id, name), campus:campuses(id, name, code)")
        .eq("school_id", user.school_id)
        .order("sequence_order")
    )
    if academic_year_id:
        query = query.eq("academic_year_id", academic_year_id)
    if campus_id:
        query = query.eq("campus_id", campus_id)
    return query.execute().data


@router.post("/terms", status_code=201)
def create_term(
    payload: TermCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="Term end_date must be on or after start_date")

    year_res = (
        supabase_admin.table("academic_years")
        .select("id, name, start_date, end_date")
        .eq("id", payload.academic_year_id)
        .eq("school_id", user.school_id)
        .execute()
    )
    if not year_res.data:
        raise HTTPException(status_code=404, detail="Academic year not found")

    yr = year_res.data[0]
    if payload.start_date.isoformat() < str(yr["start_date"]) or payload.end_date.isoformat() > str(yr["end_date"]):
        raise HTTPException(
            status_code=400,
            detail=f"Term dates must fall within academic year '{yr['name']}' ({yr['start_date']} to {yr['end_date']}).",
        )

    try:
        data = {
            **payload.model_dump(mode="json"),
            "school_id": user.school_id,
            "effective_from": (payload.effective_from or payload.start_date).isoformat(),
            "effective_to": payload.effective_to.isoformat() if payload.effective_to else None,
        }
        res = supabase_admin.table("terms").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/terms/{term_id}")
def update_term(
    term_id: str,
    payload: TermUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    updates = payload.model_dump(mode="json", exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")
    try:
        res = (
            supabase_admin.table("terms")
            .update(updates)
            .eq("id", term_id)
            .eq("school_id", user.school_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Term not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/terms/{term_id}", status_code=204)
def delete_term(
    term_id: str,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    supabase_admin.table("terms").delete().eq("id", term_id).eq(
        "school_id", user.school_id
    ).execute()


# ---------------------------------------------------------------------------
# 4. Calendar Days & Conflict Detection
# ---------------------------------------------------------------------------

@router.get("/calendar-days/conflicts")
def check_calendar_conflicts(
    day_date: date = Query(...),
    day_type: Literal["holiday", "closure", "special_schedule", "exam_day", "event"] = Query(default="holiday"),
    is_working_day: bool = Query(default=False),
    campus_id: Optional[str] = Query(default=None),
    academic_year_id: Optional[str] = Query(default=None),
    term_id: Optional[str] = Query(default=None),
    exclude_id: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    conflicts = _detect_calendar_conflicts(
        school_id=user.school_id,
        day_date=day_date,
        day_type=day_type,
        is_working_day=is_working_day,
        campus_id=campus_id,
        academic_year_id=academic_year_id,
        term_id=term_id,
        exclude_id=exclude_id,
    )
    return {"has_conflicts": len(conflicts) > 0, "conflicts": conflicts}


@router.get("/calendar-days")
def list_calendar_days(
    academic_year_id: Optional[str] = Query(default=None),
    campus_id: Optional[str] = Query(default=None),
    day_type: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    query = (
        supabase_admin.table("calendar_days")
        .select("*, campus:campuses(id, name, code), term:terms(id, name)")
        .eq("school_id", user.school_id)
        .order("day_date")
    )
    if academic_year_id:
        query = query.eq("academic_year_id", academic_year_id)
    if campus_id:
        query = query.eq("campus_id", campus_id)
    if day_type:
        query = query.eq("day_type", day_type)
    return query.execute().data


@router.post("/calendar-days", status_code=201)
def create_calendar_day(
    payload: CalendarDayCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    conflicts = _detect_calendar_conflicts(
        school_id=user.school_id,
        day_date=payload.day_date,
        day_type=payload.day_type,
        is_working_day=payload.is_working_day,
        campus_id=payload.campus_id,
        academic_year_id=payload.academic_year_id,
        term_id=payload.term_id,
    )
    if payload.reject_on_conflict and conflicts:
        raise HTTPException(
            status_code=409,
            detail={"message": "Calendar conflicts detected", "conflicts": conflicts},
        )

    try:
        data = {
            **payload.model_dump(mode="json", exclude={"reject_on_conflict"}),
            "school_id": user.school_id,
            "created_by": user.id,
        }
        res = supabase_admin.table("calendar_days").insert(data).execute()
        created = res.data[0]
        return {**created, "conflicts": conflicts}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/calendar-days/{day_id}")
def update_calendar_day(
    day_id: str,
    payload: CalendarDayUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    updates = payload.model_dump(mode="json", exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")
    try:
        res = (
            supabase_admin.table("calendar_days")
            .update(updates)
            .eq("id", day_id)
            .eq("school_id", user.school_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Calendar day not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/calendar-days/{day_id}", status_code=204)
def delete_calendar_day(
    day_id: str,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    supabase_admin.table("calendar_days").delete().eq("id", day_id).eq(
        "school_id", user.school_id
    ).execute()


# ---------------------------------------------------------------------------
# 5. Rooms & Capacity Checks
# ---------------------------------------------------------------------------

@router.get("/rooms")
def list_rooms(
    campus_id: Optional[str] = Query(default=None),
    room_type: Optional[str] = Query(default=None),
    active_only: bool = Query(default=False),
    user: CurrentUser = Depends(get_current_user),
):
    query = (
        supabase_admin.table("rooms")
        .select("*, campus:campuses(id, name, code)")
        .eq("school_id", user.school_id)
        .order("name")
    )
    if campus_id:
        query = query.eq("campus_id", campus_id)
    if room_type:
        query = query.eq("room_type", room_type)
    if active_only:
        query = query.eq("is_active", True)
    return query.execute().data


@router.post("/rooms", status_code=201)
def create_room(
    payload: RoomCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(), "school_id": user.school_id}
        res = supabase_admin.table("rooms").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/rooms/{room_id}")
def update_room(
    room_id: str,
    payload: RoomUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")
    try:
        res = (
            supabase_admin.table("rooms")
            .update(updates)
            .eq("id", room_id)
            .eq("school_id", user.school_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Room not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(
    room_id: str,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    supabase_admin.table("rooms").delete().eq("id", room_id).eq(
        "school_id", user.school_id
    ).execute()


@router.post("/rooms/capacity-check")
def check_room_capacity_post(
    payload: RoomCapacityCheckRequest,
    user: CurrentUser = Depends(get_current_user),
):
    return _evaluate_room_capacity(
        school_id=user.school_id,
        room_id=payload.room_id,
        requested_count=payload.requested_count,
        section_id=payload.section_id,
        academic_year_id=payload.academic_year_id,
        mode=payload.mode,
    )


@router.get("/rooms/{room_id}/capacity-check")
def check_room_capacity_get(
    room_id: str,
    requested_count: Optional[int] = Query(default=None, ge=0),
    section_id: Optional[str] = Query(default=None),
    academic_year_id: Optional[str] = Query(default=None),
    mode: Literal["regular", "exam"] = Query(default="regular"),
    user: CurrentUser = Depends(get_current_user),
):
    return _evaluate_room_capacity(
        school_id=user.school_id,
        room_id=room_id,
        requested_count=requested_count,
        section_id=section_id,
        academic_year_id=academic_year_id,
        mode=mode,
    )


# ---------------------------------------------------------------------------
# 6. Streams & Houses
# ---------------------------------------------------------------------------

@router.get("/streams")
def list_streams(
    campus_id: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    query = (
        supabase_admin.table("streams")
        .select("*, campus:campuses(id, name, code)")
        .eq("school_id", user.school_id)
        .order("name")
    )
    if campus_id:
        query = query.eq("campus_id", campus_id)
    return query.execute().data


@router.post("/streams", status_code=201)
def create_stream(
    payload: StreamCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(), "school_id": user.school_id}
        res = supabase_admin.table("streams").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/streams/{stream_id}")
def update_stream(
    stream_id: str,
    payload: StreamUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")
    res = (
        supabase_admin.table("streams")
        .update(updates)
        .eq("id", stream_id)
        .eq("school_id", user.school_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Stream not found")
    return res.data[0]


@router.delete("/streams/{stream_id}", status_code=204)
def delete_stream(
    stream_id: str,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    supabase_admin.table("streams").delete().eq("id", stream_id).eq(
        "school_id", user.school_id
    ).execute()


@router.get("/houses")
def list_houses(
    campus_id: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    query = (
        supabase_admin.table("houses")
        .select("*, campus:campuses(id, name, code)")
        .eq("school_id", user.school_id)
        .order("name")
    )
    if campus_id:
        query = query.eq("campus_id", campus_id)
    return query.execute().data


@router.post("/houses", status_code=201)
def create_house(
    payload: HouseCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(), "school_id": user.school_id}
        res = supabase_admin.table("houses").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/houses/{house_id}")
def update_house(
    house_id: str,
    payload: HouseUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")
    res = (
        supabase_admin.table("houses")
        .update(updates)
        .eq("id", house_id)
        .eq("school_id", user.school_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="House not found")
    return res.data[0]


@router.delete("/houses/{house_id}", status_code=204)
def delete_house(
    house_id: str,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    supabase_admin.table("houses").delete().eq("id", house_id).eq(
        "school_id", user.school_id
    ).execute()


# ---------------------------------------------------------------------------
# 7. Numbering Sequences & Transactional Generator
# ---------------------------------------------------------------------------

@router.get("/sequences")
def list_sequences(
    campus_id: Optional[str] = Query(default=None),
    sequence_type: Optional[str] = Query(default=None),
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    query = (
        supabase_admin.table("numbering_sequences")
        .select("*, campus:campuses(id, name, code), academic_year:academic_years(id, name)")
        .eq("school_id", user.school_id)
        .order("sequence_type")
        .order("effective_from", desc=True)
    )
    if campus_id:
        query = query.eq("campus_id", campus_id)
    if sequence_type:
        query = query.eq("sequence_type", sequence_type)
    return query.execute().data


@router.post("/sequences", status_code=201)
def create_sequence(
    payload: SequenceCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {
            **payload.model_dump(mode="json"),
            "school_id": user.school_id,
            "effective_from": (payload.effective_from or date.today()).isoformat(),
            "effective_to": payload.effective_to.isoformat() if payload.effective_to else None,
        }
        res = supabase_admin.table("numbering_sequences").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/sequences/{seq_id}")
def update_sequence(
    seq_id: str,
    payload: SequenceUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    updates = payload.model_dump(mode="json", exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")
    try:
        res = (
            supabase_admin.table("numbering_sequences")
            .update(updates)
            .eq("id", seq_id)
            .eq("school_id", user.school_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Numbering sequence not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/sequences/{seq_id}", status_code=204)
def delete_sequence(
    seq_id: str,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    supabase_admin.table("numbering_sequences").delete().eq("id", seq_id).eq(
        "school_id", user.school_id
    ).execute()


@router.post("/sequences/next")
def generate_next_sequence(
    payload: SequenceNextRequest,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    return generate_sequence_number(
        school_id=user.school_id,
        sequence_type=payload.sequence_type,
        campus_id=payload.campus_id,
        academic_year_id=payload.academic_year_id,
        as_of_date=payload.as_of_date,
    )


# ---------------------------------------------------------------------------
# 8. Feature Flags
# ---------------------------------------------------------------------------

@router.get("/feature-flags")
def list_feature_flags(
    campus_id: Optional[str] = Query(default=None),
    as_of_date: Optional[date] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    modules = get_effective_module_flags(
        school_id=user.school_id,
        campus_id=campus_id,
        as_of_date=as_of_date,
    )
    flags: List[Dict[str, Any]] = []
    if user.role == "admin":
        q = (
            supabase_admin.table("feature_flags")
            .select("*, campus:campuses(id, name, code)")
            .eq("school_id", user.school_id)
            .order("module_key")
            .order("effective_from", desc=True)
        )
        flags = q.execute().data or []

    return {
        "modules": modules,
        "available_modules": DEFAULT_MODULES,
        "flags": flags,
    }


@router.put("/feature-flags/{module_key}")
def upsert_feature_flag(
    module_key: str,
    payload: FeatureFlagUpdate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    eff_from = (payload.effective_from or date.today()).isoformat()
    eff_to = payload.effective_to.isoformat() if payload.effective_to else None

    existing_q = (
        supabase_admin.table("feature_flags")
        .select("*")
        .eq("school_id", user.school_id)
        .eq("module_key", module_key)
    )
    if payload.campus_id is None:
        existing_q = existing_q.is_("campus_id", "null")
    else:
        existing_q = existing_q.eq("campus_id", payload.campus_id)

    existing_rows = existing_q.order("version", desc=True).execute().data or []
    same_effective = [r for r in existing_rows if str(r.get("effective_from")) == eff_from]

    if same_effective:
        target = same_effective[0]
        upd_data: Dict[str, Any] = {
            "is_enabled": payload.is_enabled,
            "effective_to": eff_to,
            "updated_by": user.id,
        }
        if payload.description is not None:
            upd_data["description"] = payload.description
        res = (
            supabase_admin.table("feature_flags")
            .update(upd_data)
            .eq("id", target["id"])
            .execute()
        )
        return res.data[0]

    next_version = (int(existing_rows[0].get("version") or 1) + 1) if existing_rows else 1
    default_desc = next(
        (m["description"] for m in DEFAULT_MODULES if m["module_key"] == module_key),
        None,
    )
    insert_data = {
        "school_id": user.school_id,
        "campus_id": payload.campus_id,
        "module_key": module_key,
        "is_enabled": payload.is_enabled,
        "description": payload.description or default_desc,
        "effective_from": eff_from,
        "effective_to": eff_to,
        "version": next_version,
        "updated_by": user.id,
    }
    res = supabase_admin.table("feature_flags").insert(insert_data).execute()
    return res.data[0]


# ---------------------------------------------------------------------------
# 9. Academic-Year Cloning with Preview
# ---------------------------------------------------------------------------

@router.post("/academic-years/{source_year_id}/clone/preview")
def preview_academic_year_clone(
    source_year_id: str,
    payload: YearCloneRequest,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    return _build_year_clone_plan(
        school_id=user.school_id,
        source_year_id=source_year_id,
        payload=payload,
    )


@router.post("/academic-years/{source_year_id}/clone", status_code=201)
def execute_academic_year_clone(
    source_year_id: str,
    payload: YearCloneRequest,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    plan = _build_year_clone_plan(
        school_id=user.school_id,
        source_year_id=source_year_id,
        payload=payload,
    )
    if plan["has_conflicts"]:
        raise HTTPException(status_code=409, detail="; ".join(plan["warnings"]))

    if payload.target_is_current:
        supabase_admin.table("academic_years").update({"is_current": False}).eq(
            "school_id", user.school_id
        ).execute()

    target_year_res = (
        supabase_admin.table("academic_years")
        .insert(
            {
                "school_id": user.school_id,
                "name": payload.target_name,
                "start_date": payload.target_start_date.isoformat(),
                "end_date": payload.target_end_date.isoformat(),
                "is_current": payload.target_is_current,
                "campus_id": plan["target_year"]["campus_id"],
                "cloned_from_year_id": source_year_id,
            }
        )
        .execute()
    )
    created_year = target_year_res.data[0]
    new_year_id = created_year["id"]

    records = plan["records_to_clone"]
    created_counts = {
        "terms": 0,
        "calendar_days": 0,
        "fee_structures": 0,
        "numbering_sequences": 0,
        "exams": 0,
    }

    if records["terms"]:
        term_rows = [
            {
                "school_id": user.school_id,
                "campus_id": t["campus_id"],
                "academic_year_id": new_year_id,
                "name": t["name"],
                "code": t["code"],
                "start_date": t["start_date"],
                "end_date": t["end_date"],
                "sequence_order": t["sequence_order"],
                "is_current": False,
                "effective_from": t["effective_from"],
                "effective_to": t["effective_to"],
            }
            for t in records["terms"]
        ]
        res = supabase_admin.table("terms").insert(term_rows).execute()
        created_counts["terms"] = len(res.data or [])

    if records["calendar_days"]:
        cal_rows = [
            {
                "school_id": user.school_id,
                "campus_id": c["campus_id"],
                "academic_year_id": new_year_id,
                "day_date": c["day_date"],
                "day_type": c["day_type"],
                "title": c["title"],
                "description": c["description"],
                "is_working_day": c["is_working_day"],
                "schedule_override": c["schedule_override"],
                "created_by": user.id,
            }
            for c in records["calendar_days"]
        ]
        res = supabase_admin.table("calendar_days").insert(cal_rows).execute()
        created_counts["calendar_days"] = len(res.data or [])

    if records["fee_structures"]:
        fee_rows = [
            {
                "school_id": user.school_id,
                "campus_id": fs["campus_id"],
                "academic_year_id": new_year_id,
                "class_id": fs["class_id"],
                "name": fs["name"],
                "amount": fs["amount"],
                "due_date": fs["due_date"],
                "effective_from": fs["effective_from"],
                "effective_to": fs["effective_to"],
                "version": 1,
            }
            for fs in records["fee_structures"]
        ]
        res = supabase_admin.table("fee_structures").insert(fee_rows).execute()
        created_counts["fee_structures"] = len(res.data or [])

    if records["numbering_sequences"]:
        seq_rows = [
            {
                "school_id": user.school_id,
                "campus_id": sq["campus_id"],
                "academic_year_id": new_year_id,
                "sequence_type": sq["sequence_type"],
                "prefix": sq["prefix"],
                "suffix": sq["suffix"],
                "separator": sq["separator"],
                "padding": sq["padding"],
                "next_number": 1,
                "reset_policy": sq["reset_policy"],
                "effective_from": sq["effective_from"],
                "effective_to": sq["effective_to"],
                "is_active": True,
            }
            for sq in records["numbering_sequences"]
        ]
        res = supabase_admin.table("numbering_sequences").insert(seq_rows).execute()
        created_counts["numbering_sequences"] = len(res.data or [])

    if records["exams"]:
        exam_rows = [
            {
                "school_id": user.school_id,
                "campus_id": ex["campus_id"],
                "academic_year_id": new_year_id,
                "class_id": ex["class_id"],
                "name": ex["name"],
                "start_date": ex["start_date"],
                "end_date": ex["end_date"],
            }
            for ex in records["exams"]
        ]
        res = supabase_admin.table("exams").insert(exam_rows).execute()
        created_counts["exams"] = len(res.data or [])

    return {
        "academic_year": created_year,
        "cloned_from_year_id": source_year_id,
        "created_counts": created_counts,
        "excluded_student_transactions": plan["excluded_student_transactions"],
    }
