"""In-app notifications and personal notification preferences."""
from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, pagination
from app.core.exceptions import NotFound, ValidationFailed
from app.database.base import utcnow
from app.database.session import get_db
from app.models import Notification, NotificationEvent, NotificationSetting, User
from app.schemas.common import Message
from app.schemas.misc import NotificationOut, NotificationSettingItem, NotificationSettingsUpdate
from app.services.notifications import CUSTOMER_EVENTS, STAFF_EVENTS, user_settings
from app.utils.pagination import make_page

router = APIRouter(prefix="/notifications", tags=["اعلان‌ها"])


@router.get("")
def list_notifications(unread_only: bool = False, pg=Depends(pagination), user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Notification.created_at.desc()).limit(pg[1]).offset((pg[0] - 1) * pg[1])).all()
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    return {**make_page([NotificationOut.model_validate(n) for n in items], total, *pg), "unread": unread}


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    return {"count": count}


@router.post("/{notification_id}/read", response_model=Message)
def mark_read(notification_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFound("اعلان یافت نشد.")
    notification.read_at = notification.read_at or utcnow()
    db.commit()
    return Message(message="ok")


@router.post("/read-all", response_model=Message)
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=utcnow()))
    db.commit()
    return Message(message="همه اعلان‌ها خوانده شد.")


@router.delete("/{notification_id}", response_model=Message)
def delete_notification(notification_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    db.commit()
    return Message(message="اعلان حذف شد.")


@router.get("/settings", response_model=list[NotificationSettingItem])
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_settings(db, user)


@router.put("/settings", response_model=list[NotificationSettingItem])
def update_settings(data: NotificationSettingsUpdate, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    allowed = CUSTOMER_EVENTS if user.is_customer else STAFF_EVENTS
    existing = {s.event: s for s in db.scalars(select(NotificationSetting).where(NotificationSetting.user_id == user.id))}
    for item in data.items:
        if item.event not in allowed or item.event not in NotificationEvent.ALL:
            raise ValidationFailed("رویداد اعلان نامعتبر است.")
        setting = existing.get(item.event) or NotificationSetting(user_id=user.id, event=item.event)
        setting.in_app, setting.email, setting.sms = item.in_app, item.email, item.sms
        db.add(setting)
    db.commit()
    return user_settings(db, user)
