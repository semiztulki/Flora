from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import assign_uin, create_access_token, get_current_user, hash_password, verify_password
from app.bans import ban_error_detail, get_active_ban
from app.database import get_db
from app.models import Attachment, User
from app.schemas import AvatarUpdate, ProfileUpdate, TokenOut, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])

# Plain-string profile fields where an empty string means "clear this field"
# (set to NULL) rather than "leave untouched" — see ProfileUpdate's docstring.
_CLEARABLE_STRING_FIELDS = (
    "display_name",
    "first_name",
    "last_name",
    "pronouns",
    "city",
    "country",
    "languages",
    "occupation",
    "interests",
    "about",
    "website",
    "email",
    "phone",
)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = payload.model_dump(exclude_unset=True)
    for field in _CLEARABLE_STRING_FIELDS:
        if field in data:
            setattr(current_user, field, data[field] or None)
    if "birthday" in data:
        current_user.birthday = data["birthday"]
    if "birthday_show_year" in data:
        current_user.birthday_show_year = data["birthday_show_year"]
    if "email_public" in data:
        current_user.email_public = data["email_public"]
    if "phone_public" in data:
        current_user.phone_public = data["phone_public"]

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/avatar", response_model=UserOut)
async def update_avatar(
    payload: AvatarUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.attachment_id is not None:
        attachment = await db.get(Attachment, payload.attachment_id)
        if attachment is None or attachment.uploader_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    current_user.avatar_attachment_id = payload.attachment_id
    await db.commit()
    # Plain refresh() only reloads column attributes; the `avatar` relationship
    # (selectin-loaded) needs to be named explicitly or it's served stale from
    # before this change, and reading it lazily later would need a live
    # greenlet context the response serializer doesn't have.
    await db.refresh(current_user, attribute_names=["avatar_attachment_id", "avatar"])
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
