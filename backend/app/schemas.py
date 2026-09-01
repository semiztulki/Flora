from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import PresenceStatus, ReportCategory


class UserRegister(BaseModel):
    display_name: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    uin: int
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str
    bio: str | None = None
    status: PresenceStatus
    last_seen: datetime
    is_admin: bool = False


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    bio: str | None = Field(default=None, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ContactAdd(BaseModel):
    uin: int


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str
    bio: str | None = None
    status: PresenceStatus
    last_seen: datetime
    # Whether *you've* chosen to let this contact see through your invisible
    # mode. Only meaningful on your own contact list — always False on any
    # other response (e.g. ContactAddResult), since it's your call, not theirs.
    visible_when_invisible: bool = False


class ContactVisibilityUpdate(BaseModel):
    visible_when_invisible: bool


class ContactAddResult(BaseModel):
    relationship_status: str  # "pending" | "accepted"
    contact: ContactOut


class ContactRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str
    bio: str | None = None


class BlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    recipient_id: int
    body: str
    attachment: AttachmentOut | None = None
    client_id: str | None = None
    delivered: bool
    created_at: datetime


class MessageSend(BaseModel):
    recipient_id: int
    body: str = Field(min_length=1, max_length=4000)


class GroupMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str


class GroupOut(BaseModel):
    id: int
    name: str
    owner_id: int
    created_at: datetime
    members: list[GroupMemberOut]


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    member_uins: list[int] = Field(default_factory=list)


class GroupAddMember(BaseModel):
    uin: int


class GroupMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    sender_id: int
    body: str
    attachment: AttachmentOut | None = None
    client_id: str | None = None
    created_at: datetime


class BanCreate(BaseModel):
    # None = permanent ("навсегда"); otherwise how long from now, in minutes.
    duration_minutes: int | None = Field(default=None, gt=0)
    reason: str = Field(min_length=1, max_length=500)


class BanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    banned_by_id: int
    reason: str
    created_at: datetime
    expires_at: datetime | None
    lifted_at: datetime | None


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str
    bio: str | None = None
    status: PresenceStatus
    last_seen: datetime
    is_admin: bool
    active_ban: BanOut | None = None


class UinReassign(BaseModel):
    uin: int = Field(ge=10000, le=99999)


class ReportCreate(BaseModel):
    reported_uin: int
    category: ReportCategory
    comment: str | None = Field(default=None, max_length=1000)
    # At most one of these — the specific message being reported, if any.
    message_id: int | None = None
    group_message_id: int | None = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reporter_id: int
    reported_user_id: int
    category: ReportCategory
    comment: str | None
    message_excerpt: str | None
    created_at: datetime
    resolved_at: datetime | None


class ReportAdminOut(BaseModel):
    id: int
    reporter_uin: int
    reported_user_id: int
    reported_uin: int
    reported_display_name: str
    category: ReportCategory
    comment: str | None
    message_excerpt: str | None
    created_at: datetime
    resolved_at: datetime | None
