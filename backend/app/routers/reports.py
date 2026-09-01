from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.auth import get_current_user
from app.database import get_db
from app.models import GroupMember, GroupMessage, Message, Report, User
from app.routers.admin import require_admin
from app.schemas import ReportAdminOut, ReportCreate, ReportOut

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def submit_report(
    payload: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.uin == payload.reported_uin))
    reported_user = result.scalar_one_or_none()
    if reported_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if reported_user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot report yourself")

    # The excerpt is always read from the row itself, never taken from the
    # client — a report should reflect what was actually sent.
    excerpt: str | None = None
    if payload.message_id is not None:
        message = await db.get(Message, payload.message_id)
        if message is None or current_user.id not in (message.sender_id, message.recipient_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        if reported_user.id not in (message.sender_id, message.recipient_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Message doesn't involve that user"
            )
        excerpt = message.body
    elif payload.group_message_id is not None:
        group_message = await db.get(GroupMessage, payload.group_message_id)
        if group_message is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        membership = await db.execute(
            select(GroupMember).where(
                GroupMember.group_id == group_message.group_id,
                GroupMember.user_id == current_user.id,
            )
        )
        if membership.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of that group"
            )
        if group_message.sender_id != reported_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Message wasn't sent by that user"
            )
        excerpt = group_message.body

    report = Report(
        reporter_id=current_user.id,
        reported_user_id=reported_user.id,
        category=payload.category,
        comment=payload.comment,
        message_excerpt=excerpt,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


@router.get("", response_model=list[ReportAdminOut])
async def list_reports(
    resolved: bool = False,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    Reporter = aliased(User)
    Reported = aliased(User)

    query = (
        select(Report, Reporter.uin, Reported.id, Reported.uin, Reported.display_name)
        .join(Reporter, Report.reporter_id == Reporter.id)
        .join(Reported, Report.reported_user_id == Reported.id)
        .order_by(Report.created_at.desc())
    )
    if not resolved:
        query = query.where(Report.resolved_at.is_(None))

    result = await db.execute(query)
    return [
        ReportAdminOut(
            id=report.id,
            reporter_uin=reporter_uin,
            reported_user_id=reported_id,
            reported_uin=reported_uin,
            reported_display_name=reported_display_name,
            category=report.category,
            comment=report.comment,
            message_excerpt=report.message_excerpt,
            created_at=report.created_at,
            resolved_at=report.resolved_at,
        )
        for report, reporter_uin, reported_id, reported_uin, reported_display_name in result.all()
    ]


@router.post("/{report_id}/resolve", response_model=ReportOut)
async def resolve_report(
    report_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    report.resolved_at = datetime.now(timezone.utc)
    report.resolved_by_id = admin.id
    await db.commit()
    await db.refresh(report)
    return report
