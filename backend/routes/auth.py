from fastapi import APIRouter, HTTPException
from backend.models.user import UserLogin, UserResponse

router = APIRouter(prefix="/api/auth", tags=["Auth"])

@router.post("/login", response_model=UserResponse)
def login(payload: UserLogin):
    if payload.username == "admin" and payload.password == "admin123":
        return UserResponse(username="admin", role="ADMIN", token="mock-jwt-token-12345")
    raise HTTPException(status_code=401, detail="Invalid credentials")
