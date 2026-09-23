"""Demo data seeder.

Usage:
    python -m app.seed            # idempotent: creates permissions/roles and demo data if missing
    python -m app.seed --reset    # drops ALL tables, recreates schema and seeds (development only!)
"""
import argparse
import random
from datetime import date, timedelta

from sqlalchemy import select

from app.config.settings import settings
from app.core.security import hash_password
from app.database.base import Base, utcnow
from app.database.session import SessionLocal, engine
from app.models import (
    ArticleStatus,
    Company,
    CustomerRating,
    Department,
    Faq,
    FaqCategory,
    Holiday,
    KnowledgeBaseArticle,
    KnowledgeBaseCategory,
    MessageKind,
    Plan,
    Ticket,
    TicketActivity,
    TicketCategory,
    TicketMessage,
    TicketPriority,
    TicketRead,
    TicketStatus,
    TicketTag,
    User,
    UserType,
)
from app.services import sla as sla_service
from app.services.company import bootstrap_company
from app.services.rbac import ensure_system_roles

DEMO_PASSWORD = "Demo@12345"
SUPER_ADMIN_PASSWORD = "Admin@12345"

rng = random.Random(1405)


def _user(db, company, user_type, full_name, email, mobile, roles, job_title=None, organization=None,
          password=DEMO_PASSWORD) -> User:
    user = User(company_id=company.id if company else None, user_type=user_type, full_name=full_name, email=email,
                mobile=mobile, password_hash=hash_password(password), job_title=job_title, organization=organization,
                email_verified_at=utcnow(), mobile_verified_at=utcnow(), password_changed_at=utcnow())
    user.roles = roles
    db.add(user)
    db.flush()
    return user


def seed_plans(db) -> dict[str, Plan]:
    specs = [
        ("starter", "پایه", 0, 3, 500, 300, 1024, ["تیکتینگ", "پایگاه دانش", "اعلان ایمیلی"]),
        ("business", "حرفه‌ای", 4_900_000, 15, 5000, 3000, 10240,
         ["تیکتینگ", "پایگاه دانش", "SLA", "پیامک", "گزارش‌های پیشرفته"]),
        ("enterprise", "سازمانی", 14_900_000, None, None, None, None,
         ["همه امکانات", "پشتیبانی اختصاصی", "خروجی و ورود اطلاعات", "نقش‌های سفارشی"]),
    ]
    plans = {}
    for order, (code, name, price, agents, customers, tickets, storage, features) in enumerate(specs):
        plan = db.scalar(select(Plan).where(Plan.code == code))
        if plan is None:
            plan = Plan(code=code, name=name, price_monthly=price, max_agents=agents, max_customers=customers,
                        max_tickets_per_month=tickets, max_storage_mb=storage, features=features, sort_order=order,
                        description=f"پلن {name}")
            db.add(plan)
        plans[code] = plan
    db.flush()
    return plans


def seed(db) -> None:
    roles = ensure_system_roles(db)
    plans = seed_plans(db)

    if db.scalar(select(User).where(User.email == "superadmin@helpdesk.local")) is None:
        _user(db, None, UserType.SUPER_ADMIN, "مدیر کل سامانه", "superadmin@helpdesk.local", "09120000000",
              [roles["super_admin"]], job_title="مدیر پلتفرم", password=SUPER_ADMIN_PASSWORD)

    if db.scalar(select(Company).where(Company.slug == "demo")):
        db.commit()
        print("Demo company already exists — skipping demo data.")
        return

    company = Company(
        name="شرکت فناوران پارس", slug="demo", description="ارائه‌دهنده خدمات نرم‌افزاری و میزبانی ابری",
        phone="021-88776655", email="support@parstech.example", address="تهران، خیابان ولیعصر، پلاک ۱۲۰",
        website="https://parstech.example", primary_color="#4F46E5", secondary_color="#0EA5E9",
        ticket_prefix="PT", ticket_seq=1000, plan_id=plans["business"].id, subscription_status="active",
        subscription_ends_at=utcnow() + timedelta(days=365),
    )
    db.add(company)
    db.flush()
    bootstrap_company(db, company)

    admin = _user(db, company, UserType.STAFF, "سارا محمدی", "admin@demo.local", "09121111111",
                  [roles["company_admin"]], "مدیر سازمان")
    manager = _user(db, company, UserType.STAFF, "رضا کریمی", "manager@demo.local", "09122222222",
                    [roles["support_manager"]], "مدیر پشتیبانی")
    agent_specs = [
        ("علی حسینی", "agent@demo.local", "09123333301"),
        ("مریم احمدی", "agent2@demo.local", "09123333302"),
        ("حسین رضایی", "agent3@demo.local", "09123333303"),
        ("زهرا موسوی", "agent4@demo.local", "09123333304"),
        ("محمد جعفری", "agent5@demo.local", "09123333305"),
    ]
    agents = [_user(db, company, UserType.STAFF, n, e, m, [roles["support_agent"]], "کارشناس پشتیبانی")
              for n, e, m in agent_specs]
    customer_specs = [
        ("امیر نوروزی", "customer@demo.local", "09124444401", "فروشگاه آنلاین نوین"),
        ("نگار صادقی", "customer2@demo.local", "09124444402", "آژانس دیجیتال مارکتینگ پویا"),
        ("کامران بهرامی", "customer3@demo.local", "09124444403", "شرکت پخش البرز"),
        ("فاطمه قاسمی", "customer4@demo.local", "09124444404", None),
        ("بهنام شریفی", "customer5@demo.local", "09124444405", "کلینیک دندانپزشکی لبخند"),
        ("لیلا اکبری", "customer6@demo.local", "09124444406", "مدرسه هوشمند فردا"),
        ("سعید مرادی", "customer7@demo.local", "09124444407", "رستوران زیتون"),
        ("مینا رحیمی", "customer8@demo.local", "09124444408", None),
        ("پویا عباسی", "customer9@demo.local", "09124444409", "استارتاپ تاکسی‌یار"),
        ("الهام یوسفی", "customer10@demo.local", "09124444410", "دفتر حقوقی عدالت"),
    ]
    customers = [_user(db, company, UserType.CUSTOMER, n, e, m, [roles["customer"]], organization=o)
                 for n, e, m, o in customer_specs]

    # --- departments
    dept_specs = [
        ("پشتیبانی فنی", "رفع مشکلات فنی، نصب و راه‌اندازی", "round_robin", agents[:3], agents[0]),
        ("فروش", "استعلام قیمت، خرید و ارتقای سرویس", "least_loaded", agents[3:4], agents[3]),
        ("مالی و حسابداری", "صورتحساب، پرداخت و استرداد وجه", "round_robin", agents[4:], agents[4]),
        ("ارتباط با مشتریان", "پیشنهادها، انتقادها و شکایات", "least_loaded", [agents[1], agents[3]], manager),
        ("فناوری اطلاعات", "زیرساخت، شبکه و سرورها", "manual", [agents[2]], manager),
        ("مدیریت", "موارد ارجاع شده به مدیریت", "manual", [], manager),
    ]
    departments = {}
    for order, (name, desc, strategy, members, head) in enumerate(dept_specs):
        dept = Department(company_id=company.id, name=name, description=desc, assignment_strategy=strategy,
                          manager_id=head.id, sort_order=order)
        dept.members = list(dict.fromkeys(members + [head]))
        db.add(dept)
        departments[name] = dept
    db.flush()

    # --- hierarchical categories
    tree = {
        ("فنی", "پشتیبانی فنی"): ["مشکل نرم‌افزار", "مشکل ورود به حساب", "مشکل سرور", "نصب و راه‌اندازی"],
        ("مالی", "مالی و حسابداری"): ["صورتحساب", "پرداخت", "استرداد وجه"],
        ("فروش", "فروش"): ["استعلام قیمت", "ارتقای سرویس"],
        ("پیشنهاد و شکایت", "ارتباط با مشتریان"): ["شکایت", "پیشنهاد"],
    }
    leaf_categories: list[tuple[TicketCategory, Department]] = []
    for order, ((parent_name, dept_name), children) in enumerate(tree.items()):
        dept = departments[dept_name]
        parent = TicketCategory(company_id=company.id, name=parent_name, department_id=dept.id, sort_order=order)
        db.add(parent)
        db.flush()
        for child_order, child in enumerate(children):
            cat = TicketCategory(company_id=company.id, parent_id=parent.id, name=child, department_id=dept.id,
                                 sort_order=child_order)
            db.add(cat)
            leaf_categories.append((cat, dept))
    db.flush()

    # --- tags
    tag_specs = [("urgent", "#EF4444"), ("vip", "#A855F7"), ("technical", "#3B82F6"), ("payment", "#10B981"),
                 ("bug", "#F97316"), ("complaint", "#E11D48"), ("follow-up", "#0EA5E9")]
    tags = []
    for name, color in tag_specs:
        tag = TicketTag(company_id=company.id, name=name, color=color)
        db.add(tag)
        tags.append(tag)
    db.flush()

    # --- holidays (sample Iranian public holidays, Gregorian dates)
    for d, title in [(date(2026, 3, 20), "عید نوروز"), (date(2026, 3, 21), "عید نوروز"),
                     (date(2026, 3, 22), "عید نوروز"), (date(2026, 3, 23), "عید نوروز"),
                     (date(2026, 4, 1), "روز جمهوری اسلامی"), (date(2026, 4, 2), "سیزده بدر"),
                     (date(2026, 6, 4), "رحلت امام خمینی"), (date(2027, 2, 10), "پیروزی انقلاب اسلامی")]:
        db.add(Holiday(company_id=company.id, date=d, title=title))

    statuses = {s.code: s for s in db.scalars(select(TicketStatus).where(TicketStatus.company_id == company.id))}
    priorities = {p.code: p for p in db.scalars(select(TicketPriority).where(TicketPriority.company_id == company.id))}

    subjects = {
        "مشکل نرم‌افزار": ["خطای ۵۰۰ هنگام ذخیره فاکتور", "برنامه موبایل پس از به‌روزرسانی بسته می‌شود",
                           "گزارش فروش ماهانه اعداد اشتباه نشان می‌دهد"],
        "مشکل ورود به حساب": ["کد تایید پیامکی دریافت نمی‌شود", "امکان ورود با رمز جدید وجود ندارد"],
        "مشکل سرور": ["کندی شدید سرور مجازی", "قطعی سایت از ساعت ۱۰ صبح", "پر شدن فضای دیسک سرور"],
        "نصب و راه‌اندازی": ["درخواست نصب گواهی SSL", "راهنمایی برای اتصال دامنه"],
        "صورتحساب": ["عدم دریافت فاکتور رسمی", "مغایرت مبلغ صورتحساب با قرارداد"],
        "پرداخت": ["پرداخت انجام شد ولی سرویس تمدید نشد", "خطای درگاه پرداخت"],
        "استرداد وجه": ["درخواست بازگشت وجه سرویس لغو شده"],
        "استعلام قیمت": ["استعلام قیمت پلن سازمانی برای ۵۰ کاربر"],
        "ارتقای سرویس": ["درخواست ارتقا به پلن حرفه‌ای"],
        "شکایت": ["تاخیر زیاد در پاسخگویی پشتیبانی"],
        "پیشنهاد": ["پیشنهاد افزودن گزارش خروجی PDF"],
    }
    customer_lines = [
        "سلام، وقت بخیر. لطفاً در اسرع وقت بررسی کنید.", "این مشکل از دیروز شروع شده و کار ما را مختل کرده است.",
        "تصویر خطا را پیوست کردم.", "ممنون می‌شوم راهنمایی کنید.", "مشکل هنوز برطرف نشده است.",
    ]
    agent_lines = [
        "سلام، درخواست شما دریافت شد و در حال بررسی است.", "لطفاً مرورگر خود را یک بار پاک‌سازی و مجدداً تلاش کنید.",
        "مشکل شناسایی و برطرف شد. لطفاً مجدداً بررسی بفرمایید.", "برای بررسی دقیق‌تر، لطفاً شماره سفارش را ارسال کنید.",
        "درخواست شما به واحد مربوطه ارجاع شد.",
    ]
    status_cycle = ["new", "in_progress", "pending_customer", "pending_support", "escalated", "resolved", "closed",
                    "resolved", "closed", "in_progress"]
    priority_cycle = ["low", "medium", "medium", "high", "urgent", "medium", "high", "low"]

    now = utcnow()
    number = company.ticket_seq
    tickets = []
    for i in range(42):
        cat, dept = leaf_categories[i % len(leaf_categories)]
        options = subjects.get(cat.name, ["درخواست پشتیبانی"])
        subject = options[i % len(options)]
        customer = customers[i % len(customers)]
        status = statuses[status_cycle[i % len(status_cycle)]]
        priority = priorities[priority_cycle[i % len(priority_cycle)]]
        created = now - timedelta(days=rng.randint(0, 29), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
        members = [m for m in dept.members if m.id != manager.id] or agents
        agent = None if status.code == "new" and i % 3 == 0 else members[i % len(members)]
        number += 1
        ticket = Ticket(company_id=company.id, number=number, code=f"{company.ticket_prefix}-{number}",
                        subject=subject, description=f"<p>{subject}. {rng.choice(customer_lines)}</p>",
                        customer_id=customer.id, created_by_id=customer.id, department_id=dept.id,
                        category_id=cat.id, priority_id=priority.id, status_id=status.id,
                        assigned_agent_id=agent.id if agent else None, created_at=created, updated_at=created,
                        last_response_at=created, last_customer_reply_at=created)
        db.add(ticket)
        db.flush()
        db.refresh(ticket)
        sla_service.apply_sla(db, company, ticket)
        ticket.tags = rng.sample(tags, k=rng.randint(0, 2))

        # conversation
        t = created
        db.add(TicketActivity(company_id=company.id, ticket_id=ticket.id, user_id=customer.id, action="created",
                              created_at=created))
        if status.code != "new" and agent:
            for turn in range(rng.randint(1, 4)):
                t += timedelta(minutes=rng.randint(10, 300))
                if t > now:
                    break
                db.add(TicketMessage(company_id=company.id, ticket_id=ticket.id, author_id=agent.id,
                                     kind=MessageKind.REPLY, body=f"<p>{rng.choice(agent_lines)}</p>", created_at=t,
                                     updated_at=t))
                if not ticket.first_responded_at:
                    sla_service.record_first_response(ticket, t)
                ticket.last_agent_reply_at = ticket.last_response_at = t
                if turn % 2 == 0:
                    db.add(TicketMessage(company_id=company.id, ticket_id=ticket.id, author_id=manager.id,
                                         kind=MessageKind.NOTE, is_internal=True, created_at=t, updated_at=t,
                                         body=f'<p>یادداشت داخلی: <span data-type="mention" data-id="{agent.id}" '
                                              f'data-label="{agent.full_name}">@{agent.full_name}</span> لطفاً پیگیری '
                                              f'شود.</p>'))
                t += timedelta(minutes=rng.randint(5, 240))
                if t > now:
                    break
                db.add(TicketMessage(company_id=company.id, ticket_id=ticket.id, author_id=customer.id,
                                     kind=MessageKind.REPLY, body=f"<p>{rng.choice(customer_lines)}</p>",
                                     created_at=t, updated_at=t))
                ticket.last_customer_reply_at = ticket.last_response_at = t
        if status.state in ("resolved", "closed"):
            done = min(now, (ticket.last_response_at or created) + timedelta(hours=rng.randint(1, 20)))
            ticket.resolved_at = done
            if status.state == "closed":
                ticket.closed_at = done
            if ticket.resolution_due_at and done > ticket.resolution_due_at:
                ticket.resolution_breached = True
            if i % 2 == 0:
                db.add(CustomerRating(company_id=company.id, ticket_id=ticket.id, customer_id=customer.id,
                                      agent_id=ticket.assigned_agent_id, department_id=dept.id,
                                      rating=rng.choice([3, 4, 4, 5, 5, 5, 2]),
                                      feedback=rng.choice([None, "پاسخگویی سریع و دقیق بود.", "ممنون از پیگیری شما.",
                                                           "کمی زمان‌بر بود ولی حل شد."]),
                                      created_at=done))
        if status.code == "escalated":
            ticket.escalation_level = 1
            ticket.escalated_at = ticket.last_response_at
        if status.pauses_sla:
            ticket.sla_paused_at = ticket.last_response_at
        ticket.updated_at = ticket.last_response_at or created
        ticket.status = status
        sla_service.evaluate(ticket)
        db.add(TicketRead(ticket_id=ticket.id, user_id=customer.id, last_read_at=ticket.last_customer_reply_at))
        tickets.append(ticket)
    company.ticket_seq = number

    # --- knowledge base
    kb_cats = {}
    for order, (name, slug, icon, desc) in enumerate([
        ("شروع به کار", "getting-started", "rocket", "راهنمای اولیه استفاده از خدمات"),
        ("حساب کاربری", "account", "user", "ورود، رمز عبور و امنیت حساب"),
        ("مالی و پرداخت", "billing", "credit-card", "صورتحساب، پرداخت و تمدید سرویس"),
        ("مشکلات فنی", "troubleshooting", "wrench", "رفع خطاهای رایج"),
    ]):
        c = KnowledgeBaseCategory(company_id=company.id, name=name, slug=slug, icon=icon, description=desc,
                                  sort_order=order)
        db.add(c)
        kb_cats[slug] = c
    db.flush()
    articles = [
        ("getting-started", "چگونه اولین تیکت پشتیبانی را ثبت کنم؟", "how-to-create-ticket",
         "راهنمای گام‌به‌گام ثبت تیکت و پیگیری آن", ["تیکت", "راهنما"], True),
        ("getting-started", "آشنایی با وضعیت‌های تیکت", "ticket-statuses",
         "معنای هر یک از وضعیت‌های تیکت و زمان پاسخگویی", ["تیکت", "وضعیت"], False),
        ("account", "بازیابی رمز عبور از طریق پیامک", "reset-password-sms",
         "اگر رمز عبور خود را فراموش کرده‌اید این مقاله را بخوانید", ["رمز عبور", "پیامک", "ورود"], True),
        ("account", "کد تایید پیامکی دریافت نمی‌شود", "sms-code-not-received",
         "دلایل رایج عدم دریافت کد تایید و راه‌حل‌ها", ["پیامک", "ورود"], False),
        ("billing", "نحوه دریافت فاکتور رسمی", "official-invoice", "درخواست و دریافت فاکتور رسمی",
         ["فاکتور", "مالی"], False),
        ("billing", "روش‌های پرداخت و تمدید سرویس", "payment-methods", "پرداخت آنلاین، کارت به کارت و تمدید خودکار",
         ["پرداخت", "تمدید"], True),
        ("troubleshooting", "رفع خطای ۵۰۰ در پنل کاربری", "fix-error-500", "بررسی علت خطای داخلی سرور و راه‌حل",
         ["خطا", "فنی"], False),
        ("troubleshooting", "کندی سایت؛ علت‌ها و راه‌حل‌ها", "slow-website", "بهینه‌سازی سرعت و بررسی منابع سرور",
         ["سرعت", "سرور", "فنی"], False),
    ]
    for slug_cat, title, slug, summary, art_tags, featured in articles:
        content = (f"<h2>{title}</h2><p>{summary}.</p><ol><li>وارد پنل کاربری شوید.</li>"
                   f"<li>از منوی سمت راست گزینه مربوطه را انتخاب کنید.</li><li>مراحل را طبق راهنما دنبال کنید.</li>"
                   f"</ol><blockquote>در صورتی که مشکل برطرف نشد، از بخش «ثبت تیکت» با ما در ارتباط باشید."
                   f"</blockquote>")
        db.add(KnowledgeBaseArticle(company_id=company.id, category_id=kb_cats[slug_cat].id, author_id=admin.id,
                                    title=title, slug=slug, summary=summary, content=content, tags=art_tags,
                                    status=ArticleStatus.PUBLISHED, is_featured=featured,
                                    views=rng.randint(20, 900), helpful_count=rng.randint(5, 80),
                                    not_helpful_count=rng.randint(0, 10), published_at=now - timedelta(days=20)))

    # --- FAQ
    faq_cats = []
    for order, name in enumerate(["عمومی", "حساب کاربری", "مالی"]):
        c = FaqCategory(company_id=company.id, name=name, sort_order=order)
        db.add(c)
        faq_cats.append(c)
    db.flush()
    faqs = [
        (0, "ساعات پاسخگویی پشتیبانی چگونه است؟", "شنبه تا چهارشنبه ۸ تا ۱۷ و پنجشنبه‌ها ۸ تا ۱۳ پاسخگوی شما هستیم."),
        (0, "چه مدت طول می‌کشد تا به تیکت من پاسخ داده شود؟",
         "بسته به اولویت، تیکت‌های فوری حداکثر ۱۵ دقیقه و سایر تیکت‌ها در ساعات کاری پاسخ داده می‌شوند."),
        (1, "چگونه رمز عبور خود را تغییر دهم؟", "از منوی پروفایل، بخش «امنیت» را انتخاب و رمز جدید را ثبت کنید."),
        (1, "آیا می‌توانم شماره موبایل خود را تغییر دهم؟", "بله، از بخش پروفایل و پس از تایید کد پیامکی."),
        (2, "چگونه فاکتور رسمی دریافت کنم؟", "با ثبت تیکت در دسته‌بندی «صورتحساب» درخواست خود را ارسال کنید."),
        (2, "امکان استرداد وجه وجود دارد؟", "تا ۷ روز پس از خرید و در صورت عدم استفاده از سرویس امکان‌پذیر است."),
    ]
    for order, (cat_idx, question, answer) in enumerate(faqs):
        db.add(Faq(company_id=company.id, category_id=faq_cats[cat_idx].id, question=question,
                   answer=f"<p>{answer}</p>", sort_order=order))

    # --- a second tenant to demonstrate isolation
    other = Company(name="فروشگاه اینترنتی آوا", slug="ava", primary_color="#059669", secondary_color="#F59E0B",
                    ticket_prefix="AV", plan_id=plans["starter"].id, subscription_status="trial")
    db.add(other)
    db.flush()
    bootstrap_company(db, other)
    _user(db, other, UserType.STAFF, "نیما فرهادی", "admin@ava.local", "09125555501", [roles["company_admin"]],
          "مدیر فروشگاه")

    db.commit()
    print("Demo data created successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo data")
    parser.add_argument("--reset", action="store_true", help="drop and recreate all tables first (DANGEROUS)")
    args = parser.parse_args()
    if args.reset:
        if settings.is_production:
            raise SystemExit("Refusing to reset the database in production.")
        import app.models  # noqa: F401

        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        from pathlib import Path

        from alembic.config import Config

        from alembic import command

        ini = Path(__file__).resolve().parent.parent / "alembic.ini"
        cfg = Config(str(ini))
        cfg.set_main_option("script_location", str(ini.parent / "alembic"))
        command.stamp(cfg, "head")
    with SessionLocal() as db:
        seed(db)


if __name__ == "__main__":
    main()
