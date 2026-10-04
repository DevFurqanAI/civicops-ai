from typing import Literal
from pydantic import BaseModel
class CurrentUserResponse(BaseModel):
    user_id: str
    role: Literal["CITIZEN", "OPERATOR", "ADMIN"]
