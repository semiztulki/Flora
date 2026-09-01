import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PresenceStatus(str, enum.Enum):
    online = "online"
    away = "away"
    dnd = "dnd"
    # Actually connected, but broadcast to everyone else as "offline" — see
    # _broadcast_presence() in routers/ws.py for the masking.
    invisible = "invisible"
    offline = "offline"


class ContactStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64))
    hashed_password: Mapped[str] = mapped_column(String(255))
    bio: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[PresenceStatus] = mapped_column(
        Enum(PresenceStatus), default=PresenceStatus.offline
    )
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("owner_id", "contact_id", name="uq_owner_contact"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    contact_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # 'pending' until the other side accepts, then flipped to 'accepted' on both
    # the requester's row and a mirrored reverse row — classic ICQ authorization.
    status: Mapped[ContactStatus] = mapped_column(Enum(ContactStatus), default=ContactStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])
    contact: Mapped["User"] = relationship(foreign_keys=[contact_id])


class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("owner_id", "blocked_id", name="uq_owner_blocked"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])
    blocked: Mapped["User"] = relationship(foreign_keys=[blocked_id])


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("sender_id", "client_id", name="uq_sender_client_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(String(4000))
    # Client-generated id for idempotent sends (retries after a dropped connection
    # must not create duplicate messages). Unique per sender; NULL allowed for rows
    # that predate this field.
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Store-and-forward flag, mirrors classic ICQ offline messages: set True once the
    # recipient has actually received it live or via offline replay on connect.
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])
    recipient: Mapped["User"] = relationship(foreign_keys=[recipient_id])


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Store-and-forward bookkeeping per member, mirrors Message.delivered but since a
    # group message has many recipients we track "delivered up to" per membership
    # instead of a single flag per message.
    last_delivered_message_id: Mapped[int] = mapped_column(default=0)

    group: Mapped["Group"] = relationship()
    user: Mapped["User"] = relationship()


class GroupMessage(Base):
    __tablename__ = "group_messages"
    __table_args__ = (
        UniqueConstraint("sender_id", "client_id", name="uq_group_sender_client_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(String(4000))
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    group: Mapped["Group"] = relationship()
    sender: Mapped["User"] = relationship()
