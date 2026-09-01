from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Contact, User
from app.schemas import ContactAdd, ContactOut

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User)
        .join(Contact, Contact.contact_id == User.id)
        .where(Contact.owner_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
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

    existing = await db.execute(
        select(Contact).where(Contact.owner_id == current_user.id, Contact.contact_id == target.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a contact")

    db.add(Contact(owner_id=current_user.id, contact_id=target.id))

    reverse = await db.execute(
        select(Contact).where(Contact.owner_id == target.id, Contact.contact_id == current_user.id)
    )
    if reverse.scalar_one_or_none() is None:
        db.add(Contact(owner_id=target.id, contact_id=current_user.id))

    await db.commit()
    return target
