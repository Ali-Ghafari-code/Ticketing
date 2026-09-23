"""Catalog of granular permissions and default role definitions."""

# (code, Persian name, group, platform_only)
PERMISSIONS: list[tuple[str, str, str, bool]] = [
    # Tickets
    ("tickets.view", "مشاهده تیکت‌ها", "tickets", False),
    ("tickets.view_all", "مشاهده همه تیکت‌های سازمان", "tickets", False),
    ("tickets.view_own", "مشاهده تیکت‌های خود (مشتری)", "tickets", False),
    ("tickets.create", "ایجاد تیکت", "tickets", False),
    ("tickets.update", "ویرایش تیکت", "tickets", False),
    ("tickets.delete", "حذف تیکت", "tickets", False),
    ("tickets.assign", "ارجاع تیکت", "tickets", False),
    ("tickets.close", "بستن تیکت", "tickets", False),
    ("tickets.escalate", "ارجاع به سطح بالاتر", "tickets", False),
    ("tickets.reply", "پاسخ به تیکت", "tickets", False),
    ("tickets.internal_notes", "یادداشت داخلی", "tickets", False),
    ("tickets.export", "خروجی تیکت‌ها", "tickets", False),
    ("messages.edit_any", "ویرایش پیام دیگران", "tickets", False),
    ("messages.delete", "حذف پیام", "tickets", False),
    ("ratings.view", "مشاهده رضایت مشتریان", "tickets", False),
    # Users & customers
    ("users.view", "مشاهده کاربران", "users", False),
    ("users.create", "ایجاد کاربر", "users", False),
    ("users.update", "ویرایش کاربر", "users", False),
    ("users.delete", "حذف کاربر", "users", False),
    ("customers.view", "مشاهده مشتریان", "customers", False),
    ("customers.create", "ایجاد مشتری", "customers", False),
    ("customers.update", "ویرایش مشتری", "customers", False),
    ("customers.delete", "حذف مشتری", "customers", False),
    ("roles.manage", "مدیریت نقش‌ها و مجوزها", "users", False),
    # Organisation
    ("departments.manage", "مدیریت دپارتمان‌ها", "organization", False),
    ("categories.manage", "مدیریت دسته‌بندی‌ها", "organization", False),
    ("tags.manage", "مدیریت برچسب‌ها", "organization", False),
    ("statuses.manage", "مدیریت وضعیت‌ها", "organization", False),
    ("priorities.manage", "مدیریت اولویت‌ها", "organization", False),
    ("sla.manage", "مدیریت SLA", "organization", False),
    # Reports
    ("reports.view", "مشاهده گزارش‌ها", "reports", False),
    ("reports.export", "خروجی گزارش‌ها", "reports", False),
    # Content
    ("kb.manage", "مدیریت پایگاه دانش", "content", False),
    ("faq.manage", "مدیریت سوالات متداول", "content", False),
    # Settings
    ("settings.view", "مشاهده تنظیمات", "settings", False),
    ("settings.update", "ویرایش تنظیمات", "settings", False),
    ("notifications.manage", "مدیریت تنظیمات اعلان سازمان", "settings", False),
    ("audit.view", "مشاهده گزارش فعالیت‌ها", "settings", False),
    ("import.manage", "ورود اطلاعات از اکسل", "settings", False),
    # Platform (super admin)
    ("companies.manage", "مدیریت سازمان‌ها", "platform", True),
    ("plans.manage", "مدیریت پلن‌های اشتراک", "platform", True),
    ("system.settings", "تنظیمات سیستم", "platform", True),
    ("system.stats", "آمار کل سامانه", "platform", True),
]

ALL_PERMISSION_CODES = [p[0] for p in PERMISSIONS]
TENANT_PERMISSION_CODES = [p[0] for p in PERMISSIONS if not p[3]]

_MANAGER = [
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.assign", "tickets.close",
    "tickets.escalate", "tickets.reply", "tickets.internal_notes", "tickets.export", "messages.edit_any",
    "messages.delete", "ratings.view", "users.view", "users.update", "customers.view", "customers.create",
    "customers.update", "tags.manage", "sla.manage", "reports.view", "reports.export", "kb.manage", "faq.manage",
    "settings.view",
]
_AGENT = [
    "tickets.view", "tickets.create", "tickets.update", "tickets.assign", "tickets.close", "tickets.escalate",
    "tickets.reply", "tickets.internal_notes", "customers.view", "customers.create", "users.view",
]
_CUSTOMER = ["tickets.view_own", "tickets.create", "tickets.reply", "tickets.close"]

# name -> (display name, audience, description, permissions)
DEFAULT_ROLES: dict[str, tuple[str, str, str, list[str]]] = {
    "super_admin": ("مدیر کل سامانه", "platform", "دسترسی کامل به همه سازمان‌ها و تنظیمات سامانه", ALL_PERMISSION_CODES),
    "company_admin": ("مدیر سازمان", "staff", "مدیریت کامل سازمان، کارکنان، مشتریان و تنظیمات", TENANT_PERMISSION_CODES),
    "support_manager": ("مدیر پشتیبانی", "staff", "مدیریت کارشناسان، ارجاع و پایش عملکرد تیم", _MANAGER),
    "support_agent": ("کارشناس پشتیبانی", "staff", "پاسخگویی به تیکت‌های ارجاع شده", _AGENT),
    "customer": ("مشتری", "customer", "ثبت و پیگیری تیکت‌ها", _CUSTOMER),
}
