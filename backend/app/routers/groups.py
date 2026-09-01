from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Group, GroupMember, GroupMessage, User
from app.schemas import GroupAddMember, GroupCreate, GroupMemberOut, GroupMessageOut, GroupOut

router = APIRouter(prefix="/groups", tags=["groups"])


async def _require_member(db: AsyncSession, group_id: int, user_id: int) -> GroupMember:
    result = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a group member")
    return member


async def _max_message_id(db: AsyncSession, group_id: int) -> int:
    result = await db.execute(
        select(func.max(GroupMessage.id)).where(GroupMessage.group_id == group_id)
    )
    return result.scalar() or 0


async def _group_out(db: AsyncSession, group: Group) -> GroupOut:
    result = await db.execute(
        select(User).join(GroupMember, GroupMember.user_id == User.id).where(
            GroupMember.group_id == group.id
        )
    )
    members = result.scalars().all()
    return GroupOut(
        id=group.id,
        name=group.name,
        owner_id=group.owner_id,
        created_at=group.created_at,
        members=[GroupMemberOut.model_validate(m) for m in members],
    )


@router.get("", response_model=list[GroupOut])
async def list_groups(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
    )
    groups = result.scalars().all()
    return [await _group_out(db, group) for group in groups]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = Group(name=payload.name, owner_id=current_user.id)
    db.add(group)
    await db.flush()

    db.add(GroupMember(group_id=group.id, user_id=current_user.id))

    for username in payload.member_usernames:
        if username == current_user.username:
            continue
        result = await db.execute(select(User).where(User.username == username))
        member_user = result.scalar_one_or_none()
        if member_user is None:
            continue
        db.add(GroupMember(group_id=group.id, user_id=member_user.id))

    await db.commit()
    await db.refresh(group)
    return await _group_out(db, group)


@router.post("/{group_id}/members", response_model=GroupOut)
async def add_member(
    group_id: int,
    payload: GroupAddMember,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(db, group_id, current_user.id)

    result = await db.execute(select(User).where(User.username == payload.username))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == target.id)
    )
    if existing.scalar_one_or_none() is None:
        # New members don't get old history pushed to them as "offline replay" —
        # only messages sent from here on. Full history is still available via
        # the REST history endpoint below for onboarding.
        current_max = await _max_message_id(db, group_id)
        db.add(
            GroupMember(
                group_id=group_id, user_id=target.id, last_delivered_message_id=current_max
            )
        )
        await db.commit()

    group = await db.get(Group, group_id)
    return await _group_out(db, group)


@router.get("/{group_id}/messages", response_model=list[GroupMessageOut])
async def group_history(
    group_id: int,
    since_id: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(db, group_id, current_user.id)

    query = select(GroupMessage).options(selectinload(GroupMessage.attachment)).where(
        GroupMessage.group_id == group_id
    )
    if since_id:
        query = query.where(GroupMessage.id > since_id)
    result = await db.execute(query.order_by(GroupMessage.created_at))
    return result.scalars().all()
