from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decode_access_token
from app.database import async_session
from app.models import Contact, Message, PresenceStatus, User
from app.websocket_manager import manager

router = APIRouter(tags=["ws"])


async def _get_user(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _watchers_of(db: AsyncSession, user_id: int) -> list[int]:
    """Users who have `user_id` as a contact and should see their presence."""
    result = await db.execute(select(Contact.owner_id).where(Contact.contact_id == user_id))
    return [row[0] for row in result.all()]


async def _broadcast_presence(db: AsyncSession, user: User) -> None:
    payload = {
        "type": "presence",
        "user_id": user.id,
        "status": user.status.value,
        "last_seen": user.last_seen.isoformat(),
    }
    for watcher_id in await _watchers_of(db, user.id):
        await manager.send_to_user(watcher_id, payload)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    user_id = decode_access_token(token)
    if user_id is None:
        await websocket.close(code=4401)
        return

    async with async_session() as db:
        user = await _get_user(db, user_id)
        if user is None:
            await websocket.close(code=4401)
            return

        is_first_connection = await manager.connect(user_id, websocket)
        if is_first_connection:
            user.status = PresenceStatus.online
            user.last_seen = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(user)
            await _broadcast_presence(db, user)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            async with async_session() as db:
                if msg_type == "message":
                    recipient_id = data.get("recipient_id")
                    body = (data.get("body") or "").strip()
                    if not recipient_id or not body:
                        await websocket.send_json({"type": "error", "detail": "Invalid message"})
                        continue

                    message = Message(sender_id=user_id, recipient_id=recipient_id, body=body[:4000])
                    db.add(message)
                    await db.commit()
                    await db.refresh(message)

                    payload = {
                        "type": "message",
                        "id": message.id,
                        "sender_id": message.sender_id,
                        "recipient_id": message.recipient_id,
                        "body": message.body,
                        "created_at": message.created_at.isoformat(),
                    }
                    await manager.send_to_user(recipient_id, payload)
                    await manager.send_to_user(user_id, payload)

                elif msg_type == "presence":
                    new_status = data.get("status")
                    if new_status not in (PresenceStatus.online.value, PresenceStatus.away.value):
                        await websocket.send_json({"type": "error", "detail": "Invalid status"})
                        continue
                    user = await _get_user(db, user_id)
                    user.status = PresenceStatus(new_status)
                    user.last_seen = datetime.now(timezone.utc)
                    await db.commit()
                    await db.refresh(user)
                    await _broadcast_presence(db, user)

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        no_more_connections = manager.disconnect(user_id, websocket)
        if no_more_connections:
            async with async_session() as db:
                user = await _get_user(db, user_id)
                if user is not None:
                    user.status = PresenceStatus.offline
                    user.last_seen = datetime.now(timezone.utc)
                    await db.commit()
                    await db.refresh(user)
                    await _broadcast_presence(db, user)
