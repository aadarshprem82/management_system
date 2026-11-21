from typing import List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from app.core.supabase import supabase_admin

security = HTTPBearer()


class CurrentUser(BaseModel):
    id: str
    email: str
    school_id: str
    role: str
    full_name: str

def get_current_user( credentials: HTTPAuthorizationCredentials = Depends(security),) -> CurrentUser:
    token = credentials.credentials
    try:
        user_response = supabase_admin.auth.get_user(token)
        auth_user = user_response.user
        if not auth_user:
            raise HTTPException(
                status_code = status.HTTP_401_UNAUTHORIZED,
                detail = "Invalid or expired token",
            )

        profile_res = (
            supabase_admin.table("profiles")
            .select("id, email, school_id, role, full_name")
            .eq("id", auth_user.id)
            .single()
            .execute()
        )
        if not profile_res.data:
            raise HTTPException(
                status_code = status.HTTP_403_FORBIDDEN,
                detail="User profile not found",
            )

        return CurrentUser(**profile_res.data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {exc}",
        )


def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}",
            )
        return current_user

    return role_checker