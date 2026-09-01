from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.bans import get_active_ban
from app.database import get_db
from app.models import Ban, ReservedUin, User
from app.schemas import AdminUserOut, BanCreate, BanOut, UinReassign
from app.websocket_manager import manager

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    return current_user


async def _admin_user_out(db: AsyncSession, target: User) -> AdminUserOut:
    active_ban = await get_active_ban(db, target.id)
    return AdminUserOut(
        id=target.id,
        uin=target.uin,
        display_name=target.display_name,
        status=target.status,
        last_seen=target.last_seen,
        is_admin=target.is_admin,
        active_ban=BanOut.model_validate(active_ban) if active_ban else None,
    )


@router.get("/users/{uin}", response_model=AdminUserOut)
async def lookup_user(
    uin: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.uin == uin))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return await _admin_user_out(db, target)


@router.post("/users/{user_id}/uin", response_model=AdminUserOut)
async def reassign_uin(
    user_id: int,
    payload: UinReassign,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Hands a user a specific number — the escape hatch for "pretty" numbers
    held back from random registration (repdigits, round thousands, runs,
    palindromes): an admin can still grant one deliberately, e.g. to
    themselves, or as a gift/sale, without opening the reserved set up to
    everyone via ordinary registration."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    taken = await db.execute(select(User).where(User.uin == payload.uin, User.id != user_id))
    if taken.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="UIN already taken")

    old_uin = target.uin
    target.uin = payload.uin

    reserved = await db.get(ReservedUin, payload.uin)
    if reserved is not None:
        reserved.claimed_by_user_id = target.id

    # Freed number goes back to being reserved-or-random per whatever it
    # already was — nothing to do; it just becomes available again since
    # no other row references it.
    old_reserved = await db.get(ReservedUin, old_uin)
    if old_reserved is not None:
        old_reserved.claimed_by_user_id = None

    await db.commit()
    return await _admin_user_out(db, target)


@router.post("/users/{user_id}/ban", response_model=AdminUserOut)
async def ban_user(
    user_id: int,
    payload: BanCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.is_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot ban an admin")

    expires_at = (
        datetime.now(timezone.utc) + timedelta(minutes=payload.duration_minutes)
        if payload.duration_minutes is not None
        else None
    )
    ban = Ban(
        user_id=target.id,
        banned_by_id=admin.id,
        reason=payload.reason,
        expires_at=expires_at,
    )
    db.add(ban)
    await db.commit()

    # Enforce immediately rather than waiting for their next reconnect.
    await manager.close_all(target.id, code=4403)

    return await _admin_user_out(db, target)


@router.post("/users/{user_id}/unban", response_model=AdminUserOut)
async def unban_user(
    user_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    ban = await get_active_ban(db, user_id)
    if ban is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active ban")

    ban.lifted_at = datetime.now(timezone.utc)
    await db.commit()
    return await _admin_user_out(db, target)
