from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.supabase import supabase_admin
from app.core.auth import CurrentUser, get_current_user, require_roles
from app.routers import academics, analytics, assessments, attendance, fees, notices, users 

app = FastAPI(title="Management System API", version="0.1.0")
app.include_router(academics.router)
app.include_router(users.router)
app.include_router(attendance.router)
app.include_router(assessments.router)
app.include_router(fees.router)
app.include_router(notices.router)
app.include_router(analytics.router)

allowed_origins = list({
    settings.frontend_url,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
})


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def health_check():
    try:
        response = supabase_admin.table("schools").select("id, name, code").limit(1).execute()
        return {
            "status":"ok",
            "database":"connected",
            "sample_school": response.data[0] if response.data else None
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Supabase connection failed: {exc}")

@app.get("/api/v1/me", response_model=CurrentUser)
def read_current_user(current_user:CurrentUser = Depends(get_current_user)):
    return current_user


@app.get("/api/v1/admin/ping")
def admin_only_ping(current_user: CurrentUser = Depends(require_roles(["admin"]))):
    return {
        "message": f"Hello Admin {current_user.full_name}!",
        "school_id": current_user.school_id,
    }