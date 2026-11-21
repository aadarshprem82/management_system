from datetime import date
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.supabase import supabase_admin

router = APIRouter(prefix="/api/v1/fees", tags=["Fees & Payments"])


class FeeStructureCreate(BaseModel):
    academic_year_id: str
    class_id: str
    name: str
    amount: float = Field(gt=0)
    due_date: date


class FeePaymentCreate(BaseModel):
    fee_structure_id: str
    student_id: str
    amount_paid: float = Field(gt=0)
    payment_date: Optional[date] = None
    remarks: Optional[str] = None


# --- Fee Structures ---
@router.get("/structures")
def list_fee_structures(user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase_admin.table("fee_structures")
        .select("*, academic_year:academic_years(id, name), class:classes(id, name)")
        .eq("school_id", user.school_id)
        .order("due_date", desc=True)
        .execute()
    )
    return res.data


@router.post("/structures", status_code=201)
def create_fee_structure(
    payload: FeeStructureCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    try:
        data = {**payload.model_dump(mode="json"), "school_id": user.school_id}
        res = supabase_admin.table("fee_structures").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# --- Fee Payments ---
@router.get("/payments")
def list_fee_payments(user: CurrentUser = Depends(get_current_user)):
    query = (
        supabase_admin.table("fee_payments")
        .select(
            "id, amount_paid, status, payment_date, receipt_number, remarks, "
            "student:profiles!fee_payments_student_id_fkey(id, full_name, email), "
            "fee_structure:fee_structures(id, name, amount, due_date)"
        )
        .eq("school_id", user.school_id)
        .order("payment_date", desc=True)
    )
    if user.role == "student":
        query = query.eq("student_id", user.id)
    elif user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view fee payments")

    return query.execute().data


@router.post("/payments", status_code=201)
def record_fee_payment(
    payload: FeePaymentCreate,
    user: CurrentUser = Depends(require_roles(["admin"])),
):
    # Look up fee structure amount to determine paid vs partial status
    structure_res = (
        supabase_admin.table("fee_structures")
        .select("id, amount")
        .eq("id", payload.fee_structure_id)
        .eq("school_id", user.school_id)
        .single()
        .execute()
    )
    if not structure_res.data:
        raise HTTPException(status_code=404, detail="Fee structure not found")

    expected_amount = float(structure_res.data["amount"])
    status_val = "paid" if payload.amount_paid >= expected_amount else "partial"
    pay_date = payload.payment_date or date.today()
    receipt_no = f"RCPT-{pay_date.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    try:
        data = {
            "school_id": user.school_id,
            "fee_structure_id": payload.fee_structure_id,
            "student_id": payload.student_id,
            "amount_paid": payload.amount_paid,
            "status": status_val,
            "payment_date": pay_date.isoformat(),
            "receipt_number": receipt_no,
            "remarks": payload.remarks,
            "recorded_by": user.id,
        }
        res = supabase_admin.table("fee_payments").insert(data).execute()
        return res.data[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))