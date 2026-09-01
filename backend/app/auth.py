import random
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bans import ban_error_detail, get_active_ban
from app.config import settings
from app.database import get_db
from app.models import ReservedUin, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

UIN_MIN = 10000
UIN_MAX = 99999


async def assign_uin(db: AsyncSession) -> int:
    """Picks a random unused, non-"pretty" 5-digit UIN. The space is 90000
    numbers with ~1% reserved and, realistically, a tiny fraction ever taken
    — collisions are cheap enough that a plain retry loop is simpler and
    just as correct as a single clever query."""
    for _ in range(500):
        candidate = random.randint(UIN_MIN, UIN_MAX)
        reserved = await db.get(ReservedUin, candidate)
        if reserved is not None:
            continue
        taken = await db.execute(select(User.id).where(User.uin == candidate))
        if taken.scalar_one_or_none() is not None:
            continue
        return candidate
    raise RuntimeError("Could not allocate a UIN — space exhausted or unlucky streak")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return int(user_id)


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = decode_access_token(token)
    if user_id is None:
        raise credentials_exception
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    should_be_admin = user.uin in settings.admin_uin_set
    if user.is_admin != should_be_admin:
        user.is_admin = should_be_admin
        await db.commit()
        await db.refresh(user)

    ban = await get_active_ban(db, user.id)
    if ban is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ban_error_detail(ban))

    return user
