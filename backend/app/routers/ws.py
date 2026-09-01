from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.auth import decode_access_token
from app.bans import get_active_ban
from app.database import async_session
from app.models import (
    Attachment,
    Block,
    Contact,
    GroupMember,
    GroupMessage,
    Message,
    PresenceStatus,
    User,
)
from app.websocket_manager import manager

_SETTABLE_STATUSES = {
    PresenceStatus.online.value,
    PresenceStatus.away.value,
    PresenceStatus.dnd.value,
    PresenceStatus.invisible.value,
}

router = APIRouter(tags=["ws"])


async def _attachment_payload(db: AsyncSession, attachment_id: int | None) -> dict | None:
    if attachment_id is None:
        return None
    attachment = await db.get(Attachment, attachment_id)
    if attachment is None:
        return None
    return {
        "id": attachment.id,
        "content_type": attachment.content_type,
        "size_bytes": attachment.size_bytes,
        "width": attachment.width,
        "height": attachment.height,
    }


async def _message_payload(db: AsyncSession, message: Message) -> dict:
    return {
        "type": "message",
        "id": message.id,
        "sender_id": message.sender_id,
        "recipient_id": message.recipient_id,
        "body": message.body,
        "attachment": await _attachment_payload(db, message.attachment_id),
        "client_id": message.client_id,
        "created_at": message.created_at.isoformat(),
    }


async def _group_message_payload(db: AsyncSession, message: GroupMessage) -> dict:
    return {
        "type": "group_message",
        "id": message.id,
        "group_id": message.group_id,
        "sender_id": message.sender_id,
        "body": message.body,
        "attachment": await _attachment_payload(db, message.attachment_id),
        "client_id": message.client_id,
        "created_at": message.created_at.isoformat(),
    }


async def _get_user(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _watchers_of(db: AsyncSession, user_id: int) -> list[tuple[int, bool]]:
    """Users who have `user_id` as a contact and should see their presence,
    paired with whether `user_id` has chosen to let each of them see through
    invisible mode instead of just seeing "offline"."""
    # WatcherRow (owner=watcher, contact=user_id) finds the watchers.
    # PermissionRow (owner=user_id, contact=watcher) is *user_id's own* row
    # about that watcher — where their visible_when_invisible choice lives.
    WatcherRow = aliased(Contact)
    PermissionRow = aliased(Contact)
    result = await db.execute(
        select(WatcherRow.owner_id, PermissionRow.visible_when_invisible)
        .select_from(WatcherRow)
        .outerjoin(
            PermissionRow,
            (PermissionRow.owner_id == user_id) & (PermissionRow.contact_id == WatcherRow.owner_id),
        )
        .where(WatcherRow.contact_id == user_id)
    )
    return [(row[0], bool(row[1])) for row in result.all()]


async def _broadcast_presence(db: AsyncSession, user: User) -> None:
    # Invisible means actually connected, but by default everyone else sees
    # "offline" — the whole point of the mode. Contacts the user has
    # explicitly allowed (Contact.visible_when_invisible) are told the truth;
    # everyone else, and the user's own other clients, always see the truth.
    for watcher_id, sees_through_invisible in await _watchers_of(db, user.id):
        if user.status == PresenceStatus.invisible and not sees_through_invisible:
            visible_status = PresenceStatus.offline.value
        else:
            visible_status = user.status.value
        payload = {
            "type": "presence",
            "user_id": user.id,
            "status": visible_status,
            "last_seen": user.last_seen.isoformat(),
        }
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
        payload = await _message_payload(db, message)
        # Tells the client this is backlog, not a live event — no incoming
        # sound, since replaying a whole backlog on reconnect shouldn't fire
        # a sound for every message in it (some of which the client may
        # already display locally from before the connection ever dropped).
        payload["replay"] = True
        if await manager.send_to_user(user_id, payload):
            message.delivered = True
            # Committed per-message rather than once at the end: if the
            # connection dies partway through a long backlog, whatever was
            # already sent stays marked delivered instead of being replayed
            # (and re-sounding) again on every future reconnect. A message
            # that genuinely failed to send is left False on purpose — it'll
            # be retried on the next connect instead of silently vanishing.
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
            payload = await _group_message_payload(db, message)
            payload["replay"] = True  # backlog, not live — no incoming sound
            if not await manager.send_to_user(user_id, payload):
                break  # connection's gone — stop, the rest stays pending for next time
            membership.last_delivered_message_id = message.id
            # Per-message commit, same reasoning as _replay_offline_messages:
            # a dropped connection mid-backlog shouldn't undo progress on the
            # messages that did get sent.
            await db.commit()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str, status: str = "online"):
    user_id = decode_access_token(token)
    if user_id is None:
        await websocket.close(code=4401)
        return

    initial_status = PresenceStatus(status) if status in _SETTABLE_STATUSES else PresenceStatus.online

    async with async_session() as db:
        user = await _get_user(db, user_id)
        if user is None:
            await websocket.close(code=4401)
            return

        ban = await get_active_ban(db, user_id)
        if ban is not None:
            await websocket.accept()
            await websocket.send_json(
                {
                    "type": "banned",
                    "reason": ban.reason,
                    "expires_at": ban.expires_at.isoformat() if ban.expires_at else None,
                }
            )
            await websocket.close(code=4403)
            return

        is_first_connection = await manager.connect(user_id, websocket)
        if is_first_connection:
            # Passed as a query param (rather than always defaulting to online then
            # flipping) so reconnecting while invisible/dnd doesn't flash "online"
            # to watchers for the split second before the client can update it.
            user.status = initial_status
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
                    attachment_id = data.get("attachment_id")
                    if not recipient_id or (not body and not attachment_id):
                        await websocket.send_json({"type": "error", "detail": "Invalid message"})
                        continue

                    if attachment_id:
                        attachment = await db.get(Attachment, attachment_id)
                        if attachment is None or attachment.uploader_id != user_id:
                            await websocket.send_json(
                                {"type": "error", "detail": "Invalid attachment"}
                            )
                            continue

                    blocked = await db.execute(
                        select(Block).where(
                            or_(
                                (Block.owner_id == recipient_id) & (Block.blocked_id == user_id),
                                (Block.owner_id == user_id) & (Block.blocked_id == recipient_id),
                            )
                        )
                    )
                    if blocked.first() is not None:
                        await websocket.send_json({"type": "error", "detail": "Blocked"})
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
                            await manager.send_to_user(
                                user_id, await _message_payload(db, existing_message)
                            )
                            continue

                    message = Message(
                        sender_id=user_id,
                        recipient_id=recipient_id,
                        body=body[:4000],
                        attachment_id=attachment_id,
                        client_id=client_id,
                        # Starts False regardless of presence — flipped True
                        # below only once a live send actually succeeds, not
                        # just because the recipient looked online a moment
                        # ago. Otherwise a push that silently fails (a dead
                        # socket the server hasn't noticed yet) would mark
                        # itself delivered and never get offered again via
                        # offline replay — a real message quietly lost.
                        delivered=False,
                    )
                    db.add(message)
                    try:
                        await db.commit()
                    except IntegrityError:
                        # Same client_id landed here from elsewhere at the
                        # same moment (e.g. a retry racing in from another of
                        # the sender's own devices) — the unique constraint
                        # caught what the pre-check above can't fully rule out.
                        await db.rollback()
                        existing = await db.execute(
                            select(Message).where(
                                Message.sender_id == user_id, Message.client_id == client_id
                            )
                        )
                        existing_message = existing.scalar_one_or_none()
                        if existing_message is not None:
                            await manager.send_to_user(
                                user_id, await _message_payload(db, existing_message)
                            )
                        continue
                    await db.refresh(message)

                    payload = await _message_payload(db, message)
                    # Messaging yourself: recipient_id == user_id, so the
                    # "notify recipient" and "echo to sender" sends below
                    # would otherwise deliver the exact same payload twice
                    # over the same connection — the single send to yourself
                    # both confirms the send and counts as the delivery.
                    if recipient_id == user_id:
                        message.delivered = await manager.send_to_user(user_id, payload)
                    else:
                        message.delivered = await manager.send_to_user(recipient_id, payload)
                        await manager.send_to_user(user_id, payload)
                    await db.commit()

                elif msg_type == "group_message":
                    group_id = data.get("group_id")
                    body = (data.get("body") or "").strip()
                    client_id = data.get("client_id")
                    attachment_id = data.get("attachment_id")
                    if not group_id or (not body and not attachment_id):
                        await websocket.send_json({"type": "error", "detail": "Invalid message"})
                        continue

                    if attachment_id:
                        attachment = await db.get(Attachment, attachment_id)
                        if attachment is None or attachment.uploader_id != user_id:
                            await websocket.send_json(
                                {"type": "error", "detail": "Invalid attachment"}
                            )
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
                                user_id, await _group_message_payload(db, existing_message)
                            )
                            continue

                    message = GroupMessage(
                        group_id=group_id,
                        sender_id=user_id,
                        body=body[:4000],
                        attachment_id=attachment_id,
                        client_id=client_id,
                    )
                    db.add(message)
                    try:
                        await db.commit()
                    except IntegrityError:
                        # Same race as the DM path above.
                        await db.rollback()
                        existing = await db.execute(
                            select(GroupMessage).where(
                                GroupMessage.sender_id == user_id,
                                GroupMessage.client_id == client_id,
                            )
                        )
                        existing_message = existing.scalar_one_or_none()
                        if existing_message is not None:
                            await manager.send_to_user(
                                user_id, await _group_message_payload(db, existing_message)
                            )
                        continue
                    await db.refresh(message)

                    payload = await _group_message_payload(db, message)
                    members_result = await db.execute(
                        select(GroupMember).where(GroupMember.group_id == group_id)
                    )
                    for membership in members_result.scalars().all():
                        # Only advance the per-member watermark on a confirmed
                        # send — same reasoning as the DM `delivered` flag:
                        # presence alone doesn't mean the push actually landed.
                        if await manager.send_to_user(membership.user_id, payload):
                            membership.last_delivered_message_id = message.id
                    await db.commit()

                elif msg_type == "presence":
                    new_status = data.get("status")
                    if new_status not in _SETTABLE_STATUSES:
                        await websocket.send_json({"type": "error", "detail": "Invalid status"})
                        continue
                    user = await _get_user(db, user_id)
                    user.status = PresenceStatus(new_status)
                    user.last_seen = datetime.now(timezone.utc)
                    await db.commit()
                    await db.refresh(user)
                    await _broadcast_presence(db, user)

                elif msg_type == "typing":
                    # Ephemeral, not persisted — best-effort only to whoever's online.
                    recipient_id = data.get("recipient_id")
                    group_id = data.get("group_id")
                    if recipient_id:
                        await manager.send_to_user(
                            recipient_id,
                            {"type": "typing", "sender_id": user_id, "recipient_id": recipient_id},
                        )
                    elif group_id:
                        members_result = await db.execute(
                            select(GroupMember.user_id).where(
                                GroupMember.group_id == group_id, GroupMember.user_id != user_id
                            )
                        )
                        for (member_id,) in members_result.all():
                            await manager.send_to_user(
                                member_id,
                                {"type": "typing", "sender_id": user_id, "group_id": group_id},
                            )

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
