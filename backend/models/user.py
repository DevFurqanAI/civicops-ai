from pydantic import BaseModel

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    username: str
    role: str
    token: str
