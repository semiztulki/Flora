from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import PresenceStatus, ReportCategory


class UserRegister(BaseModel):
    display_name: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    uin: int
    password: str


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None


class UserOut(BaseModel):
    """Your own full profile — everything, including the private fields
    (email/phone) that only show on someone else's view of you if you've
    explicitly opted them into *_public."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str
    avatar: AttachmentOut | None = None
    first_name: str | None = None
    last_name: str | None = None
    pronouns: str | None = None
    birthday: date | None = None
    birthday_show_year: bool = True
    city: str | None = None
    country: str | None = None
    languages: str | None = None
    occupation: str | None = None
    interests: str | None = None
    about: str | None = None
    website: str | None = None
    email: str | None = None
    email_public: bool = False
    phone: str | None = None
    phone_public: bool = False
    status: PresenceStatus
    invisible: bool = False
    status_note: str | None = None
    status_expires_at: datetime | None = None
    last_seen: datetime
    is_admin: bool = False


class ProfileUpdate(BaseModel):
    """All fields optional/patch-style. An empty string clears a field
    (sets it to NULL); omitting a field (or sending null) leaves it
    untouched — the two are deliberately different so "clear this field"
    is possible without resending everything else."""

    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    first_name: str | None = Field(default=None, max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    pronouns: str | None = Field(default=None, max_length=32)
    birthday: date | None = None
    birthday_show_year: bool | None = None
    city: str | None = Field(default=None, max_length=64)
    country: str | None = Field(default=None, max_length=64)
    languages: str | None = Field(default=None, max_length=200)
    occupation: str | None = Field(default=None, max_length=100)
    interests: str | None = Field(default=None, max_length=300)
    about: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=200)
    email_public: bool | None = None
    phone: str | None = Field(default=None, max_length=32)
    phone_public: bool | None = None


class AvatarUpdate(BaseModel):
    attachment_id: int | None = None  # null clears the avatar


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
    avatar: AttachmentOut | None = None
    status: PresenceStatus
    last_seen: datetime
    # Attached to the *current* status; masked to None along with `status`
    # itself when this contact is invisible and hasn't granted you visibility
    # — otherwise it'd leak presence info invisible mode is supposed to hide.
    status_note: str | None = None
    # Whether *you've* chosen to let this contact see through your invisible
    # mode. Only meaningful on your own contact list — always False on any
    # other response (e.g. ContactAddResult), since it's your call, not theirs.
    visible_when_invisible: bool = False
    # Your own private label for them ("Лена — реставратор") — never visible
    # to them or anyone else.
    local_nickname: str | None = None


class ContactNicknameUpdate(BaseModel):
    local_nickname: str | None = Field(default=None, max_length=64)


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


class BlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uin: int
    display_name: str


class PublicProfileOut(BaseModel):
    """Someone else's profile, the way you're allowed to see it — status
    and status_note already masked for invisible mode, email/phone only
    present if they opted into *_public, local_nickname is your own private
    label for them (not theirs)."""

    id: int
    uin: int
    display_name: str
    avatar: AttachmentOut | None = None
    first_name: str | None = None
    last_name: str | None = None
    pronouns: str | None = None
    birthday: date | None = None
    birthday_show_year: bool = True
    city: str | None = None
    country: str | None = None
    languages: str | None = None
    occupation: str | None = None
    interests: str | None = None
    about: str | None = None
    website: str | None = None
    email: str | None = None
    phone: str | None = None
    status: PresenceStatus
    status_note: str | None = None
    last_seen: datetime
    local_nickname: str | None = None
    is_contact: bool = False


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
