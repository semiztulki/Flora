from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Block, Contact, ContactStatus, User
from app.schemas import (
    BlockOut,
    ContactAdd,
    ContactAddResult,
    ContactOut,
    ContactRequestOut,
)

router = APIRouter(prefix="/contacts", tags=["contacts"])


async def _is_blocked_either_way(db: AsyncSession, user_a: int, user_b: int) -> bool:
    result = await db.execute(
        select(Block).where(
            or_(
                (Block.owner_id == user_a) & (Block.blocked_id == user_b),
                (Block.owner_id == user_b) & (Block.blocked_id == user_a),
            )
        )
    )
    return result.first() is not None


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User)
        .join(Contact, Contact.contact_id == User.id)
        .where(Contact.owner_id == current_user.id, Contact.status == ContactStatus.accepted)
    )
    return result.scalars().all()


@router.get("/requests", response_model=list[ContactRequestOut])
async def list_incoming_requests(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Contacts who added you and are waiting for you to authorize them."""
    result = await db.execute(
        select(User)
        .join(Contact, Contact.owner_id == User.id)
        .where(Contact.contact_id == current_user.id, Contact.status == ContactStatus.pending)
    )
    return result.scalars().all()


@router.get("/blocked", response_model=list[BlockOut])
async def list_blocked(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).join(Block, Block.blocked_id == User.id).where(Block.owner_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=ContactAddResult, status_code=status.HTTP_201_CREATED)
async def add_contact(
    payload: ContactAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.username == current_user.username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot add yourself")

    result = await db.execute(select(User).where(User.username == payload.username))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if await _is_blocked_either_way(db, current_user.id, target.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Blocked")

    existing = await db.execute(
        select(Contact).where(Contact.owner_id == current_user.id, Contact.contact_id == target.id)
    )
    existing_row = existing.scalar_one_or_none()
    if existing_row is not None:
        detail = "Already a contact" if existing_row.status == ContactStatus.accepted else "Request already sent"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    # They already sent you a request — mutual interest, authorize immediately
    # instead of leaving two pending requests sitting around.
    reverse = await db.execute(
        select(Contact).where(Contact.owner_id == target.id, Contact.contact_id == current_user.id)
    )
    reverse_row = reverse.scalar_one_or_none()
    if reverse_row is not None and reverse_row.status == ContactStatus.pending:
        reverse_row.status = ContactStatus.accepted
        db.add(Contact(owner_id=current_user.id, contact_id=target.id, status=ContactStatus.accepted))
        await db.commit()
        return ContactAddResult(relationship_status="accepted", contact=target)

    db.add(Contact(owner_id=current_user.id, contact_id=target.id, status=ContactStatus.pending))
    await db.commit()
    return ContactAddResult(relationship_status="pending", contact=target)


@router.post("/requests/{requester_id}/accept", response_model=ContactOut)
async def accept_request(
    requester_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(
            Contact.owner_id == requester_id,
            Contact.contact_id == current_user.id,
            Contact.status == ContactStatus.pending,
        )
    )
    request_row = result.scalar_one_or_none()
    if request_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such request")

    request_row.status = ContactStatus.accepted

    reverse = await db.execute(
        select(Contact).where(Contact.owner_id == current_user.id, Contact.contact_id == requester_id)
    )
    reverse_row = reverse.scalar_one_or_none()
    if reverse_row is None:
        db.add(Contact(owner_id=current_user.id, contact_id=requester_id, status=ContactStatus.accepted))
    else:
        reverse_row.status = ContactStatus.accepted

    await db.commit()

    requester = await db.get(User, requester_id)
    return requester


@router.post("/requests/{requester_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_request(
    requester_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(
            Contact.owner_id == requester_id,
            Contact.contact_id == current_user.id,
            Contact.status == ContactStatus.pending,
        )
    )
    request_row = result.scalar_one_or_none()
    if request_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such request")

    await db.delete(request_row)
    await db.commit()


@router.post("/block", response_model=BlockOut)
async def block_user(
    payload: ContactAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == payload.username))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(Block).where(Block.owner_id == current_user.id, Block.blocked_id == target.id)
    )
    if existing.scalar_one_or_none() is None:
        db.add(Block(owner_id=current_user.id, blocked_id=target.id))

    # Blocking severs any existing/pending relationship in both directions.
    contacts = await db.execute(
        select(Contact).where(
            or_(
                (Contact.owner_id == current_user.id) & (Contact.contact_id == target.id),
                (Contact.owner_id == target.id) & (Contact.contact_id == current_user.id),
            )
        )
    )
    for row in contacts.scalars().all():
        await db.delete(row)

    await db.commit()
    return target


@router.post("/unblock", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(
    payload: ContactAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == payload.username))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(Block).where(Block.owner_id == current_user.id, Block.blocked_id == target.id)
    )
    block_row = existing.scalar_one_or_none()
    if block_row is not None:
        await db.delete(block_row)
        await db.commit()
