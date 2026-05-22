import uuid
from sqlalchemy.orm import Session
from ..models.audit import AuditLog


def log_action(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    ip_address: str | None = None,
    detail: str | None = None,
) -> None:
    """Append-only audit log entry. Audit failures must never break the app."""
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            detail=detail,
        )
        db.add(entry)
        db.commit()
    except Exception:
        pass
