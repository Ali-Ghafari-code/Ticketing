export type UserType = "super_admin" | "staff" | "customer";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UserBrief {
  id: string;
  full_name: string;
  email?: string | null;
  mobile?: string | null;
  user_type: UserType;
  avatar_url?: string | null;
}

export interface RoleBrief {
  id: string;
  name: string;
  display_name: string;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface User extends UserBrief {
  company_id: string | null;
  job_title: string | null;
  organization: string | null;
  notes?: string | null;
  is_active: boolean;
  email_verified_at: string | null;
  mobile_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
  roles: RoleBrief[];
  departments: NamedRef[];
  tickets_count?: number;
}

export interface CompanyBranding {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

export interface Me extends User {
  permissions: string[];
  preferences: {
    theme?: "light" | "dark" | "system";
    ticket_columns?: string[];
    ticket_page_size?: number;
    sidebar_collapsed?: boolean;
  };
  company: CompanyBranding | null;
}

export interface TicketStatus {
  id: string;
  name: string;
  code: string;
  color: string;
  state: "open" | "pending" | "resolved" | "closed";
  is_default?: boolean;
  pauses_sla?: boolean;
  is_system?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface TicketPriority {
  id: string;
  name: string;
  code: string;
  color: string;
  level: number;
  is_default?: boolean;
  is_system?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  tickets_count?: number;
}

export type SlaStatus = "none" | "healthy" | "warning" | "breached" | "paused" | "met";

export interface TicketListItem {
  id: string;
  number: number;
  code: string;
  subject: string;
  channel: string;
  customer: UserBrief;
  assigned_agent: UserBrief | null;
  department: NamedRef | null;
  category: NamedRef | null;
  priority: TicketPriority;
  status: TicketStatus;
  tags: Tag[];
  sla_status: SlaStatus;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  first_responded_at: string | null;
  due_date: string | null;
  last_response_at: string | null;
  escalation_level: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  resolved_at: string | null;
  unread: boolean;
}

export interface Attachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  original_name: string;
  mime_type: string;
  size: number;
  is_internal: boolean;
  created_at: string;
  uploaded_by: UserBrief | null;
  is_image: boolean;
  previewable: boolean;
}

export interface TicketPermissions {
  reply: boolean;
  internal_note: boolean;
  update: boolean;
  assign: boolean;
  escalate: boolean;
  close: boolean;
  reopen: boolean;
  delete: boolean;
  rate: boolean;
  upload: boolean;
}

export interface Rating {
  id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
}

export interface TicketDetail extends TicketListItem {
  description: string;
  created_by: UserBrief | null;
  last_customer_reply_at: string | null;
  last_agent_reply_at: string | null;
  sla_paused_at: string | null;
  first_response_breached: boolean;
  resolution_breached: boolean;
  reopened_count: number;
  escalated_at: string | null;
  rating: Rating | null;
  attachments: Attachment[];
  can: TicketPermissions;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  kind: "reply" | "note" | "system";
  body: string;
  is_internal: boolean;
  author: UserBrief | null;
  attachments: Attachment[];
  mentions: UserBrief[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  is_read: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface TicketActivity {
  id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  user: UserBrief | null;
  created_at: string;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  department_id: string | null;
  default_agent_id: string | null;
  default_priority_id: string | null;
  is_active: boolean;
  sort_order: number;
  children: Category[];
  tickets_count: number;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  manager_id: string | null;
  manager: UserBrief | null;
  assignment_strategy: "manual" | "round_robin" | "least_loaded";
  is_active: boolean;
  sort_order: number;
  members: UserBrief[];
  open_tickets: number;
  created_at: string;
}

export interface TicketMeta {
  categories: Category[];
  departments: { id: string; name: string; description: string | null }[];
  priorities: TicketPriority[];
  statuses: TicketStatus[];
  tags?: Tag[];
  agents?: UserBrief[];
  settings: {
    customer_can_select_priority: boolean;
    customer_can_select_department: boolean;
    require_category: boolean;
    kb_suggest_before_ticket: boolean;
    rating_enabled: boolean;
    max_upload_size_mb: number;
    max_files: number;
    allowed_extensions: string[];
  };
}

export interface SlaRule {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  priority_id: string | null;
  department: NamedRef | null;
  priority: { id: string; name: string; color: string; level: number } | null;
  first_response_minutes: number;
  resolution_minutes: number;
  warning_percent: number;
  business_hours_only: boolean;
  is_active: boolean;
}

export interface Holiday {
  id: string;
  date: string;
  title: string;
}

export interface Notification {
  id: string;
  event: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationSetting {
  event: string;
  label?: string;
  in_app: boolean;
  email: boolean;
  sms: boolean;
}

export interface KbCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  articles_count: number;
}

export interface KbArticleListItem {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  tags: string[];
  status: "draft" | "published";
  is_featured: boolean;
  views: number;
  helpful_count: number;
  not_helpful_count: number;
  category: KbCategory | null;
  author: UserBrief | null;
  published_at: string | null;
  updated_at: string;
}

export interface KbArticle extends KbArticleListItem {
  content: string;
  category_id: string | null;
  related: KbArticleListItem[];
  my_feedback: boolean | null;
}

export interface FaqCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface Faq {
  id: string;
  category_id: string | null;
  category: FaqCategory | null;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  group: string;
  is_platform: boolean;
}

export interface Role {
  id: string;
  company_id: string | null;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  audience: "staff" | "customer" | "platform";
  permissions: Permission[];
  users_count: number;
}

export interface AuditLog {
  id: string;
  company_id: string | null;
  user: UserBrief | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price_monthly: number;
  max_agents: number | null;
  max_customers: number | null;
  max_tickets_per_month: number | null;
  max_storage_mb: number | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
  companies_count: number;
}

export interface WorkingDay {
  enabled: boolean;
  start: string;
  end: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  primary_color: string;
  secondary_color: string;
  timezone: string;
  working_hours: Record<string, WorkingDay>;
  settings: Record<string, unknown>;
  ticket_prefix: string;
  plan_id: string | null;
  plan: Plan | null;
  subscription_status: "trial" | "active" | "expired" | "suspended";
  subscription_ends_at: string | null;
  is_active: boolean;
  created_at: string;
  stats: { staff: number; customers: number; tickets: number } | null;
}

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  link: string;
  meta: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  tickets: SearchHit[];
  customers: SearchHit[];
  agents: SearchHit[];
  articles: SearchHit[];
  messages: SearchHit[];
}

export interface BreakdownRow {
  id: string | null;
  name: string;
  color: string | null;
  count: number;
  open: number;
  resolved: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  sla_breached: number;
  sla_met: number;
  sla_compliance: number | null;
  rating_avg?: number | null;
  rating_count?: number;
}

export interface Summary {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  new_today: number;
  this_week: number;
  this_month: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  sla_met: number;
  sla_breached: number;
  sla_warning: number;
  sla_compliance: number | null;
  reopened: number;
  unassigned: number;
  escalated: number;
  overdue: number;
  satisfaction_avg: number | null;
  satisfaction_count: number;
  satisfaction_percent: number | null;
}

export interface DateCount {
  date: string;
  created: number;
  resolved: number;
}

export interface ResponseTrendRow {
  date: string;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
}

export interface TicketStats {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  closed: number;
}
