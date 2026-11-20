from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.supabase import supabase_admin

app = FastAPI(title="Management System API", version="0.1.0")

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