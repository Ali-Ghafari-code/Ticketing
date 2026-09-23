export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
export const API_ORIGIN = (() => {
  try {
    return new URL(API_URL).origin;
  } catch {
    return "";
  }
})();

export const SLA_LABELS: Record<string, string> = {
  none: "بدون SLA",
  healthy: "در مهلت",
  warning: "نزدیک به پایان مهلت",
  breached: "نقض شده",
  paused: "متوقف",
  met: "رعایت شده",
};

export const STATE_LABELS: Record<string, string> = {
  open: "باز",
  pending: "در انتظار",
  resolved: "حل شده",
  closed: "بسته",
};

export const ASSIGNMENT_LABELS: Record<string, string> = {
  manual: "دستی",
  round_robin: "نوبتی (Round-robin)",
  least_loaded: "کمترین بار کاری",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  created: "تیکت را ایجاد کرد",
  status_changed: "وضعیت را تغییر داد",
  reopened: "تیکت را بازگشایی کرد",
  priority_changed: "اولویت را تغییر داد",
  assigned: "تیکت را ارجاع داد",
  unassigned: "ارجاع را حذف کرد",
  escalated: "به سطح بالاتر ارجاع داد",
  updated: "تیکت را ویرایش کرد",
  attachment_added: "فایل پیوست کرد",
  rated: "امتیاز ثبت کرد",
  auto_closed: "به صورت خودکار بسته شد",
};

export const FIELD_LABELS: Record<string, string> = {
  status: "وضعیت",
  priority: "اولویت",
  assigned_agent: "کارشناس",
  department: "دپارتمان",
  category: "دسته‌بندی",
  subject: "موضوع",
  escalation_level: "سطح ارجاع",
  attachments: "پیوست",
  rating: "امتیاز",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "ورود",
  "auth.login_failed": "ورود ناموفق",
  "auth.logout": "خروج",
  "auth.register": "ثبت‌نام",
  "auth.password_changed": "تغییر رمز عبور",
  "auth.password_reset": "بازیابی رمز عبور",
  "auth.token_reuse_detected": "تشخیص استفاده مجدد توکن",
  "ticket.created": "ایجاد تیکت",
  "ticket.updated": "ویرایش تیکت",
  "ticket.status_changed": "تغییر وضعیت",
  "ticket.priority_changed": "تغییر اولویت",
  "ticket.assigned": "ارجاع تیکت",
  "ticket.escalated": "ارجاع به سطح بالاتر",
  "ticket.deleted": "حذف تیکت",
  "message.edited": "ویرایش پیام",
  "message.deleted": "حذف پیام",
  "user.created": "ایجاد کاربر",
  "user.updated": "ویرایش کاربر",
  "user.deleted": "حذف کاربر",
  "user.password_reset": "بازنشانی رمز کاربر",
  "customer.created": "ایجاد مشتری",
  "customer.updated": "ویرایش مشتری",
  "customer.deleted": "حذف مشتری",
  "role.created": "ایجاد نقش",
  "role.updated": "ویرایش نقش",
  "role.deleted": "حذف نقش",
  "role.permissions_changed": "تغییر مجوزها",
  "settings.updated": "ویرایش تنظیمات",
  "company.created": "ایجاد سازمان",
  "company.updated": "ویرایش سازمان",
  "company.deleted": "حذف سازمان",
  "config.changed": "تغییر پیکربندی",
  "data.imported": "ورود اطلاعات",
  "data.exported": "خروجی اطلاعات",
};

export const WEEKDAYS: { key: string; label: string }[] = [
  { key: "saturday", label: "شنبه" },
  { key: "sunday", label: "یکشنبه" },
  { key: "monday", label: "دوشنبه" },
  { key: "tuesday", label: "سه‌شنبه" },
  { key: "wednesday", label: "چهارشنبه" },
  { key: "thursday", label: "پنجشنبه" },
  { key: "friday", label: "جمعه" },
];

export const SUBSCRIPTION_LABELS: Record<string, string> = {
  trial: "آزمایشی",
  active: "فعال",
  expired: "منقضی",
  suspended: "تعلیق",
};
