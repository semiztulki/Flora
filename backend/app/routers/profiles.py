from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Contact, ContactStatus, PresenceStatus, User
from app.schemas import AttachmentOut, PublicProfileOut

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/{uin}", response_model=PublicProfileOut)
async def get_profile(
    uin: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.uin == uin))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # My own row about them (do I let them see my invisible status? not
    # relevant here) vs. their row about me — it's *their* row about *me*
    # that decides whether I see through their invisible mode.
    their_row = await db.execute(
        select(Contact).where(
            Contact.owner_id == target.id,
            Contact.contact_id == current_user.id,
            Contact.status == ContactStatus.accepted,
        )
    )
    their_row = their_row.scalar_one_or_none()
    they_show_me = bool(their_row and their_row.visible_when_invisible)

    my_row = await db.execute(
        select(Contact).where(
            Contact.owner_id == current_user.id,
            Contact.contact_id == target.id,
            Contact.status == ContactStatus.accepted,
        )
    )
    my_row = my_row.scalar_one_or_none()

    masked = target.invisible and not they_show_me and target.id != current_user.id

    return PublicProfileOut(
        id=target.id,
        uin=target.uin,
        display_name=target.display_name,
        avatar=AttachmentOut.model_validate(target.avatar) if target.avatar else None,
        first_name=target.first_name,
        last_name=target.last_name,
        pronouns=target.pronouns,
        birthday=target.birthday,
        birthday_show_year=target.birthday_show_year,
        city=target.city,
        country=target.country,
        languages=target.languages,
        occupation=target.occupation,
        interests=target.interests,
        about=target.about,
        website=target.website,
        email=target.email if target.email_public else None,
        phone=target.phone if target.phone_public else None,
        status=PresenceStatus.offline if masked else target.status,
        status_note=None if masked else target.status_note,
        last_seen=target.last_seen,
        local_nickname=my_row.local_nickname if my_row else None,
        is_contact=my_row is not None,
    )
