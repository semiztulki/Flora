from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import assign_uin, create_access_token, get_current_user, hash_password, verify_password
from app.bans import ban_error_detail, get_active_ban
from app.database import get_db
from app.models import User
from app.schemas import ProfileUpdate, TokenOut, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.bio is not None:
        current_user.bio = payload.bio
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    # No username to choose or collide on — the UIN is the identity, and
    # it's assigned, never picked (see assign_uin: random, excludes the
    # "pretty" reserved set).
    uin = await assign_uin(db)
    user = User(
        uin=uin,
        display_name=payload.display_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return TokenOut(access_token=token, user=user)


@router.post("/login", response_model=TokenOut)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.uin == payload.uin))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid UIN or password"
        )

    ban = await get_active_ban(db, user.id)
    if ban is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ban_error_detail(ban))

    token = create_access_token(user.id)
    return TokenOut(access_token=token, user=user)
