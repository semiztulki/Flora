from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decode_access_token
from app.database import async_session
from app.models import Contact, GroupMember, GroupMessage, Message, PresenceStatus, User
from app.websocket_manager import manager

router = APIRouter(tags=["ws"])


def _message_payload(message: Message) -> dict:
    return {
        "type": "message",
        "id": message.id,
        "sender_id": message.sender_id,
        "recipient_id": message.recipient_id,
        "body": message.body,
        "client_id": message.client_id,
        "created_at": message.created_at.isoformat(),
    }


def _group_message_payload(message: GroupMessage) -> dict:
    return {
        "type": "group_message",
        "id": message.id,
        "group_id": message.group_id,
        "sender_id": message.sender_id,
        "body": message.body,
        "client_id": message.client_id,
        "created_at": message.created_at.isoformat(),
    }


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


async def _replay_offline_messages(db: AsyncSession, user_id: int) -> None:
    """Classic ICQ behaviour: anything that arrived while you were offline gets
    pushed to you the moment you reconnect, then is marked delivered."""
    result = await db.execute(
        select(Message)
        .where(Message.recipient_id == user_id, Message.delivered.is_(False))
        .order_by(Message.created_at)
    )
    pending = result.scalars().all()
    if not pending:
        return

    for message in pending:
        await manager.send_to_user(user_id, _message_payload(message))
        message.delivered = True
    await db.commit()


async def _replay_offline_group_messages(db: AsyncSession, user_id: int) -> None:
    """Same store-and-forward idea as DMs, but delivery is tracked per membership
    since a group message has many recipients instead of one."""
    result = await db.execute(select(GroupMember).where(GroupMember.user_id == user_id))
    memberships = result.scalars().all()

    for membership in memberships:
        pending_result = await db.execute(
            select(GroupMessage)
            .where(
                GroupMessage.group_id == membership.group_id,
                GroupMessage.id > membership.last_delivered_message_id,
            )
            .order_by(GroupMessage.created_at)
        )
        pending = pending_result.scalars().all()
        if not pending:
            continue
        for message in pending:
            await manager.send_to_user(user_id, _group_message_payload(message))
        membership.last_delivered_message_id = pending[-1].id
    await db.commit()


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

        await _replay_offline_messages(db, user_id)
        await _replay_offline_group_messages(db, user_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            async with async_session() as db:
                if msg_type == "message":
                    recipient_id = data.get("recipient_id")
                    body = (data.get("body") or "").strip()
                    client_id = data.get("client_id")
                    if not recipient_id or not body:
                        await websocket.send_json({"type": "error", "detail": "Invalid message"})
                        continue

                    if client_id:
                        existing = await db.execute(
                            select(Message).where(
                                Message.sender_id == user_id, Message.client_id == client_id
                            )
                        )
                        existing_message = existing.scalar_one_or_none()
                        if existing_message is not None:
                            # Retry after a dropped connection: just re-confirm to the
                            # sender, don't re-notify the recipient a second time.
                            await manager.send_to_user(user_id, _message_payload(existing_message))
                            continue

                    recipient_online = manager.is_online(recipient_id)
                    message = Message(
                        sender_id=user_id,
                        recipient_id=recipient_id,
                        body=body[:4000],
                        client_id=client_id,
                        delivered=recipient_online,
                    )
                    db.add(message)
                    await db.commit()
                    await db.refresh(message)

                    payload = _message_payload(message)
                    if recipient_online:
                        await manager.send_to_user(recipient_id, payload)
                    await manager.send_to_user(user_id, payload)

                elif msg_type == "group_message":
                    group_id = data.get("group_id")
                    body = (data.get("body") or "").strip()
                    client_id = data.get("client_id")
                    if not group_id or not body:
                        await websocket.send_json({"type": "error", "detail": "Invalid message"})
                        continue

                    membership_result = await db.execute(
                        select(GroupMember).where(
                            GroupMember.group_id == group_id, GroupMember.user_id == user_id
                        )
                    )
                    if membership_result.scalar_one_or_none() is None:
                        await websocket.send_json(
                            {"type": "error", "detail": "Not a group member"}
                        )
                        continue

                    if client_id:
                        existing = await db.execute(
                            select(GroupMessage).where(
                                GroupMessage.sender_id == user_id,
                                GroupMessage.client_id == client_id,
                            )
                        )
                        existing_message = existing.scalar_one_or_none()
                        if existing_message is not None:
                            await manager.send_to_user(
                                user_id, _group_message_payload(existing_message)
                            )
                            continue

                    message = GroupMessage(
                        group_id=group_id,
                        sender_id=user_id,
                        body=body[:4000],
                        client_id=client_id,
                    )
                    db.add(message)
                    await db.commit()
                    await db.refresh(message)

                    payload = _group_message_payload(message)
                    members_result = await db.execute(
                        select(GroupMember).where(GroupMember.group_id == group_id)
                    )
                    for membership in members_result.scalars().all():
                        if manager.is_online(membership.user_id):
                            await manager.send_to_user(membership.user_id, payload)
                            membership.last_delivered_message_id = message.id
                    await db.commit()

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
