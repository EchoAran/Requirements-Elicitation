from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr

from database.database import get_db
from database.models import User

router = APIRouter()

class LoginRequest(BaseModel):
    account: str
    password: str

class RegisterRequest(BaseModel):
    account: str
    password: str
    username: str
    email: EmailStr | None = None

@router.post("/api/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.user_account == payload.account,
        User.user_password == payload.password,
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="账号或密码错误")
    return {
        "success": True,
        "user": {
            "user_id": user.user_id,
            "user_name": user.user_name,
            "user_email": user.user_email,
        },
    }

@router.post("/api/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.user_account == payload.account).first()
    if exists:
        raise HTTPException(status_code=400, detail="账号已存在")
    user = User(
        user_account=payload.account,
        user_password=payload.password,
        user_name=payload.username,
        user_email=payload.email,
        user_role="User",
        updated_time=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"success": True, "message": "注册成功"}

