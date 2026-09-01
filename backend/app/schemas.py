from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import PresenceStatus


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    display_name: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    status: PresenceStatus
    last_seen: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ContactAdd(BaseModel):
    username: str


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    status: PresenceStatus
    last_seen: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    recipient_id: int
    body: str
    client_id: str | None = None
    delivered: bool
    created_at: datetime


class MessageSend(BaseModel):
    recipient_id: int
    body: str = Field(min_length=1, max_length=4000)


class GroupMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str


class GroupOut(BaseModel):
    id: int
    name: str
    owner_id: int
    created_at: datetime
    members: list[GroupMemberOut]


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    member_usernames: list[str] = Field(default_factory=list)


class GroupAddMember(BaseModel):
    username: str


class GroupMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    sender_id: int
    body: str
    client_id: str | None = None
    created_at: datetime
