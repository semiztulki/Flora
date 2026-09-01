import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from PIL import Image
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Attachment, GroupMember, GroupMessage, Message, User
from app.schemas import AttachmentOut

router = APIRouter(prefix="/attachments", tags=["attachments"])

# Images only for now — deliberately no documents/archives/executables. Content
# type is never trusted from the client, only what Pillow actually decodes.
CONTENT_TYPE_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "GIF": "image/gif",
    "WEBP": "image/webp",
}
EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def _upload_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read(settings.max_attachment_bytes + 1)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > settings.max_attachment_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.max_attachment_bytes} byte limit",
        )

    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()
        image = Image.open(io.BytesIO(data))  # verify() consumes the parser, reopen to read size
        width, height = image.size
        content_type = CONTENT_TYPE_BY_FORMAT.get(image.format or "")
    except Exception:
        content_type = None

    if content_type is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only jpeg/png/gif/webp images are supported",
        )

    storage_key = f"{uuid.uuid4().hex}{EXTENSION_BY_CONTENT_TYPE[content_type]}"
    (_upload_dir() / storage_key).write_bytes(data)

    attachment = Attachment(
        uploader_id=current_user.id,
        content_type=content_type,
        size_bytes=len(data),
        storage_key=storage_key,
        width=width,
        height=height,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


async def _can_access(db: AsyncSession, attachment: Attachment, user_id: int) -> bool:
    if attachment.uploader_id == user_id:
        return True

    # Anyone signed in can view an avatar — it's shown on contacts lists and
    # profile cards, not just to message participants like a photo attachment.
    avatar_owner = await db.execute(
        select(User.id).where(User.avatar_attachment_id == attachment.id)
    )
    if avatar_owner.first() is not None:
        return True

    dm = await db.execute(
        select(Message.id).where(
            Message.attachment_id == attachment.id,
            or_(Message.sender_id == user_id, Message.recipient_id == user_id),
        )
    )
    if dm.first() is not None:
        return True

    group_ids_result = await db.execute(
        select(GroupMessage.group_id).where(GroupMessage.attachment_id == attachment.id)
    )
    group_ids = [row[0] for row in group_ids_result.all()]
    if not group_ids:
        return False

    membership = await db.execute(
        select(GroupMember.id).where(
            GroupMember.group_id.in_(group_ids), GroupMember.user_id == user_id
        )
    )
    return membership.first() is not None


async def _get_authorized_attachment(
    attachment_id: int, current_user: User, db: AsyncSession
) -> Attachment:
    attachment = await db.get(Attachment, attachment_id)
    if attachment is None or not await _can_access(db, attachment, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return attachment


@router.get("/{attachment_id}", response_model=AttachmentOut)
async def get_attachment_meta(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_authorized_attachment(attachment_id, current_user, db)


@router.get("/{attachment_id}/file")
async def get_attachment_file(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attachment = await _get_authorized_attachment(attachment_id, current_user, db)
    path = _upload_dir() / attachment.storage_key
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")

    return StreamingResponse(io.BytesIO(path.read_bytes()), media_type=attachment.content_type)
