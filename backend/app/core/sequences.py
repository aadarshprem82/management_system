from datetime import date
import threading
from typing import Any, Dict, Optional
from fastapi import HTTPException

from app.core.supabase import supabase_admin

# Process-local lock guard for optimistic CAS fallback when DB RPC is unavailable
_SEQ_LOCKS: Dict[str, threading.Lock] = {}
_SEQ_LOCKS_GUARD = threading.Lock()


def _get_lock(school_id: str, sequence_type: str) -> threading.Lock:
    key = f"{school_id}:{sequence_type}"
    with _SEQ_LOCKS_GUARD:
        if key not in _SEQ_LOCKS:
            _SEQ_LOCKS[key] = threading.Lock()
        return _SEQ_LOCKS[key]


def _pick_matching_sequence(
    rows: list[dict],
    campus_id: Optional[str],
    academic_year_id: Optional[str],
    as_of: date,
) -> Optional[dict]:
    as_of_iso = as_of.isoformat()
    candidates = []
    for row in rows:
        if not row.get("is_active", True):
            continue
        eff_from = str(row.get("effective_from") or "1900-01-01")
        eff_to = row.get("effective_to")
        if eff_from > as_of_iso:
            continue
        if eff_to is not None and str(eff_to) < as_of_iso:
            continue
        row_campus = row.get("campus_id")
        if row_campus is not None and row_campus != campus_id:
            continue
        row_year = row.get("academic_year_id")
        if row_year is not None and row_year != academic_year_id:
            continue
        candidates.append(row)

    if not candidates:
        return None

    candidates.sort(
        key=lambda r: (
            1 if r.get("campus_id") is not None and r.get("campus_id") == campus_id else 0,
            1 if r.get("academic_year_id") is not None and r.get("academic_year_id") == academic_year_id else 0,
            str(r.get("effective_from") or ""),
            int(r.get("version") or 1),
            str(r.get("created_at") or ""),
        ),
        reverse=True,
    )
    return candidates[0]


def format_sequence_value(seq: dict, number_value: int) -> str:
    padding = int(seq.get("padding") or 4)
    prefix = seq.get("prefix") or ""
    separator = seq.get("separator") if seq.get("separator") is not None else "-"
    suffix = seq.get("suffix") or ""
    padded = str(number_value).zfill(padding)
    return f"{prefix}{separator}{padded}{suffix}"


def _generate_via_optimistic_cas(
    school_id: str,
    sequence_type: str,
    campus_id: Optional[str],
    academic_year_id: Optional[str],
    as_of: date,
    max_retries: int = 10,
) -> Dict[str, Any]:
    """Thread-safe + optimistic CAS fallback if DB RPC is not available."""
    lock = _get_lock(school_id, sequence_type)
    with lock:
        for _ in range(max_retries):
            res = (
                supabase_admin.table("numbering_sequences")
                .select("*")
                .eq("school_id", school_id)
                .eq("sequence_type", sequence_type)
                .eq("is_active", True)
                .execute()
            )
            seq = _pick_matching_sequence(
                res.data or [],
                campus_id=campus_id,
                academic_year_id=academic_year_id,
                as_of=as_of,
            )
            if not seq:
                raise HTTPException(
                    status_code=404,
                    detail=f"No active numbering sequence configured for '{sequence_type}'.",
                )

            reset_policy = seq.get("reset_policy") or "never"
            period: Optional[str] = None
            if reset_policy == "yearly":
                period = as_of.strftime("%Y")
            elif reset_policy == "monthly":
                period = as_of.strftime("%Y%m")

            stored_next = int(seq["next_number"])
            if period is not None and seq.get("last_reset_period") != period:
                current_num = 1
            else:
                current_num = stored_next

            update_payload: Dict[str, Any] = {"next_number": current_num + 1}
            if period is not None:
                update_payload["last_reset_period"] = period

            # Optimistic concurrency guard: only update if next_number hasn't changed
            upd = (
                supabase_admin.table("numbering_sequences")
                .update(update_payload)
                .eq("id", seq["id"])
                .eq("next_number", stored_next)
                .execute()
            )
            if not upd.data:
                continue

            formatted = format_sequence_value(seq, current_num)
            try:
                supabase_admin.table("numbering_sequence_logs").insert(
                    {
                        "school_id": school_id,
                        "sequence_id": seq["id"],
                        "sequence_type": sequence_type,
                        "generated_number": formatted,
                        "number_value": current_num,
                    }
                ).execute()
            except Exception as log_exc:
                # If unique violation on generated_number, retry cleanly
                if "duplicate" in str(log_exc).lower() or "23505" in str(log_exc):
                    continue

            return {
                "sequence_id": seq["id"],
                "sequence_type": sequence_type,
                "number_value": current_num,
                "formatted_number": formatted,
                "campus_id": seq.get("campus_id"),
            }

    raise HTTPException(
        status_code=409,
        detail=f"Concurrent sequence contention while generating '{sequence_type}' number.",
    )


def generate_sequence_number(
    school_id: str,
    sequence_type: str,
    campus_id: Optional[str] = None,
    academic_year_id: Optional[str] = None,
    as_of_date: Optional[date] = None,
) -> Dict[str, Any]:
    """Generates the next unique transactional sequence number for a school/campus."""
    as_of = as_of_date or date.today()
    rpc_params = {
        "p_school_id": school_id,
        "p_sequence_type": sequence_type,
        "p_campus_id": campus_id,
        "p_academic_year_id": academic_year_id,
        "p_as_of_date": as_of.isoformat(),
    }

    try:
        rpc_res = supabase_admin.rpc("generate_next_sequence_number", rpc_params).execute()
        if rpc_res.data:
            return rpc_res.data
    except Exception as exc:
        msg = str(exc)
        if "NO_ACTIVE_SEQUENCE" in msg:
            raise HTTPException(
                status_code=404,
                detail=f"No active numbering sequence configured for '{sequence_type}'.",
            )
        # Fall back to optimistic CAS path if RPC function is unavailable (e.g. mocked client or pre-migration)

    return _generate_via_optimistic_cas(
        school_id=school_id,
        sequence_type=sequence_type,
        campus_id=campus_id,
        academic_year_id=academic_year_id,
        as_of=as_of,
    )
