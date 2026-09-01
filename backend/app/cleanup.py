import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select, update

from app.config import settings
from app.database import async_session
from app.models import Attachment, GroupMessage, Message, User

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_SECONDS = 6 * 3600
EXPIRED_PLACEHOLDER = "[изображение удалено]"


async def cleanup_old_attachments() -> int:
    """Deletes attachments older than the retention window, from disk and the
    DB. Referencing messages are kept but lose the attachment (and get a
    placeholder body) rather than being deleted themselves."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.attachment_retention_days)
    upload_dir = Path(settings.upload_dir)

    async with async_session() as db:
        avatar_ids = await db.execute(
            select(User.avatar_attachment_id).where(User.avatar_attachment_id.isnot(None))
        )
        avatar_attachment_ids = {row[0] for row in avatar_ids.all()}

        result = await db.execute(select(Attachment).where(Attachment.created_at < cutoff))
        # Avatars are a standing profile field, not chat ephemera — they
        # don't expire just because they're old.
        expired = [a for a in result.scalars().all() if a.id not in avatar_attachment_ids]

        for attachment in expired:
            await db.execute(
                update(Message)
                .where(Message.attachment_id == attachment.id)
                .values(attachment_id=None, body=EXPIRED_PLACEHOLDER)
            )
            await db.execute(
                update(GroupMessage)
                .where(GroupMessage.attachment_id == attachment.id)
                .values(attachment_id=None, body=EXPIRED_PLACEHOLDER)
            )
            (upload_dir / attachment.storage_key).unlink(missing_ok=True)
            await db.delete(attachment)

        await db.commit()
        return len(expired)


async def run_cleanup_loop() -> None:
    while True:
        try:
            removed = await cleanup_old_attachments()
            if removed:
                logger.info("Cleaned up %d expired attachment(s)", removed)
        except Exception:
            logger.exception("Attachment cleanup pass failed")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
