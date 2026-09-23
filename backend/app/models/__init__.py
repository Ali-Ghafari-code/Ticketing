"""Import every model so SQLAlchemy/Alembic see the full metadata."""
from app.models.audit import AuditLog
from app.models.auth import PasswordReset, UserSession, VerificationCode
from app.models.company import DEFAULT_WORKING_HOURS, Company, Holiday, Plan, SystemSetting
from app.models.department import AssignmentStrategy, Department, department_users
from app.models.knowledge_base import (
    ArticleStatus,
    Faq,
    FaqCategory,
    KnowledgeBaseArticle,
    KnowledgeBaseCategory,
    KnowledgeBaseFeedback,
)
from app.models.notification import Notification, NotificationEvent, NotificationSetting
from app.models.ticket import (
    CustomerRating,
    MessageKind,
    SlaStatus,
    Ticket,
    TicketActivity,
    TicketAttachment,
    TicketMessage,
    TicketRead,
    message_mentions,
    ticket_tag_relations,
)
from app.models.ticket_config import SlaRule, StatusState, TicketCategory, TicketPriority, TicketStatus, TicketTag
from app.models.user import Permission, Role, User, UserType, role_permissions, user_roles

__all__ = [
    "AuditLog", "PasswordReset", "UserSession", "VerificationCode", "DEFAULT_WORKING_HOURS", "Company", "Holiday",
    "Plan", "SystemSetting", "AssignmentStrategy", "Department", "department_users", "ArticleStatus", "Faq",
    "FaqCategory", "KnowledgeBaseArticle", "KnowledgeBaseCategory", "KnowledgeBaseFeedback", "Notification",
    "NotificationEvent", "NotificationSetting", "CustomerRating", "MessageKind", "SlaStatus", "Ticket",
    "TicketActivity", "TicketAttachment", "TicketMessage", "TicketRead", "message_mentions",
    "ticket_tag_relations", "SlaRule", "StatusState", "TicketCategory", "TicketPriority", "TicketStatus",
    "TicketTag", "Permission", "Role", "User", "UserType", "role_permissions", "user_roles",
]
