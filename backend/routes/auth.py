from fastapi import APIRouter, Depends
from backend.auth import current_user
from backend.models.user import CurrentUserResponse
router = APIRouter(prefix="/api/auth", tags=["Auth"])

@router.get("/me", response_model=CurrentUserResponse)
def me(user=Depends(current_user)):
    return {"user_id": user.user_id, "role": user.role}
