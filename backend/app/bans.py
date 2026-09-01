from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ban


async def get_active_ban(db: AsyncSession, user_id: int) -> Ban | None:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Ban)
        .where(
            Ban.user_id == user_id,
            Ban.lifted_at.is_(None),
            or_(Ban.expires_at.is_(None), Ban.expires_at > now),
        )
        .order_by(Ban.created_at.desc())
    )
    return result.scalars().first()


def ban_error_detail(ban: Ban) -> dict:
    return {
        "code": "banned",
        "reason": ban.reason,
        "expires_at": ban.expires_at.isoformat() if ban.expires_at else None,
    }
