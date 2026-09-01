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
    # Kept in sync with Settings.admin_username_set on every authenticated
    # request — see get_current_user() in app/auth.py.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
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
    # Lives on the *owner's* row about this contact: when owner_id is
    # invisible, does contact_id get told the truth instead of "offline"?
    visible_when_invisible: Mapped[bool] = mapped_column(Boolean, default=False)
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


class Ban(Base):
    __tablename__ = "bans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    banned_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # NULL means permanent ("навсегда").
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set when an admin lifts the ban early; otherwise it just expires on its own.
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    banned_by: Mapped["User"] = relationship(foreign_keys=[banned_by_id])


class ReportCategory(str, enum.Enum):
    spam = "spam"
    scam = "scam"
    threats = "threats"
    illegal_content = "illegal_content"
    other = "other"


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reported_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[ReportCategory] = mapped_column(Enum(ReportCategory))
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Captured server-side from the actual row at submission time (never
    # trusted from the client) — a snapshot, not a live link, so it survives
    # the message later expiring (attachments) or the conversation moving on.
    message_excerpt: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    reporter: Mapped["User"] = relationship(foreign_keys=[reporter_id])
    reported_user: Mapped["User"] = relationship(foreign_keys=[reported_user_id])


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int]
    # Filename on disk (or future object-storage key) — never the original
    # filename, to avoid path traversal and collisions.
    storage_key: Mapped[str] = mapped_column(String(255))
    width: Mapped[int | None] = mapped_column(nullable=True)
    height: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    uploader: Mapped["User"] = relationship()


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("sender_id", "client_id", name="uq_sender_client_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(String(4000))
    attachment_id: Mapped[int | None] = mapped_column(ForeignKey("attachments.id"), nullable=True)
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
    attachment: Mapped["Attachment | None"] = relationship()


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
    attachment_id: Mapped[int | None] = mapped_column(ForeignKey("attachments.id"), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    group: Mapped["Group"] = relationship()
    sender: Mapped["User"] = relationship()
    attachment: Mapped["Attachment | None"] = relationship()
