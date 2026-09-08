from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import Manager
from app.core.security import verify_password, hash_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    full_name: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6)


@router.post("/register", response_model=LoginResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Manager self-registration (spec section 2: the schema already
    supports multiple managers, even though the current UI only surfaces
    one at a time). Auto-logs the new manager in on success."""
    existing = db.query(Manager).filter(Manager.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="That username is already taken")
    manager = Manager(username=payload.username, full_name=payload.full_name,
                      hashed_password=hash_password(payload.password))
    db.add(manager)
    db.commit()
    db.refresh(manager)
    token = create_access_token({"sub": manager.username})
    return LoginResponse(access_token=token, username=manager.username, full_name=manager.full_name)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    manager = db.query(Manager).filter(Manager.username == payload.username).first()
    if not manager or not verify_password(payload.password, manager.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": manager.username})
    return LoginResponse(access_token=token, username=manager.username, full_name=manager.full_name)
