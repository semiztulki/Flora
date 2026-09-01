from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Message, User
from app.schemas import MessageOut

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/{contact_id}", response_model=list[MessageOut])
async def get_history(
    contact_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(
            or_(
                (Message.sender_id == current_user.id) & (Message.recipient_id == contact_id),
                (Message.sender_id == contact_id) & (Message.recipient_id == current_user.id),
            )
        )
        .order_by(Message.created_at)
    )
    return result.scalars().all()
