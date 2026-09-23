"""Automatic ticket assignment: category default agent, department round-robin or least-loaded."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AssignmentStrategy,
    Company,
    Department,
    Role,
    StatusState,
    Ticket,
    TicketStatus,
    User,
    UserType,
    department_users,
    user_roles,
)
from app.models.user import Permission, role_permissions
from app.services.company import company_setting


def eligible_agents_query(company_id: str, department_id: str | None = None):
    """Active staff that can reply to tickets (i.e. hold the tickets.reply permission)."""
    stmt = (
        select(User)
        .join(user_roles, user_roles.c.user_id == User.id)
        .join(Role, Role.id == user_roles.c.role_id)
        .join(role_permissions, role_permissions.c.role_id == Role.id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .where(User.company_id == company_id, User.user_type == UserType.STAFF, User.is_active.is_(True),
               User.deleted_at.is_(None), Permission.code == "tickets.reply")
        .distinct()
    )
    if department_id:
        stmt = stmt.join(department_users, department_users.c.user_id == User.id).where(
            department_users.c.department_id == department_id)
    return stmt


def open_load(db: Session, company_id: str, agent_ids: list[str]) -> dict[str, int]:
    if not agent_ids:
        return {}
    rows = db.execute(
        select(Ticket.assigned_agent_id, func.count())
        .join(TicketStatus, TicketStatus.id == Ticket.status_id)
        .where(Ticket.company_id == company_id, Ticket.deleted_at.is_(None),
               Ticket.assigned_agent_id.in_(agent_ids),
               TicketStatus.state.in_([StatusState.OPEN, StatusState.PENDING]))
        .group_by(Ticket.assigned_agent_id)
    ).all()
    load = {agent_id: 0 for agent_id in agent_ids}
    load.update({agent_id: count for agent_id, count in rows})
    return load


def pick_agent(db: Session, company: Company, ticket: Ticket) -> User | None:
    if not company_setting(company, "auto_assign_enabled"):
        return None

    category = ticket.category
    if category and category.default_agent_id:
        agent = db.scalar(eligible_agents_query(company.id).where(User.id == category.default_agent_id))
        if agent:
            return agent

    department = db.get(Department, ticket.department_id) if ticket.department_id else None
    strategy = department.assignment_strategy if department else company_setting(company, "default_assignment_strategy")
    if strategy == AssignmentStrategy.MANUAL:
        return None

    candidates = list(db.scalars(eligible_agents_query(company.id, department.id if department else None)
                                 .order_by(User.id)).unique())
    if not candidates:
        return None

    if strategy == AssignmentStrategy.LEAST_LOADED:
        load = open_load(db, company.id, [c.id for c in candidates])
        return min(candidates, key=lambda c: (load.get(c.id, 0), c.full_name))

    # round robin
    last_id = department.last_assigned_user_id if department else (company.settings or {}).get("_rr_last_agent")
    ids = [c.id for c in candidates]
    next_index = (ids.index(last_id) + 1) % len(ids) if last_id in ids else 0
    agent = candidates[next_index]
    if department:
        department.last_assigned_user_id = agent.id
    else:
        company.settings = {**(company.settings or {}), "_rr_last_agent": agent.id}
    return agent
