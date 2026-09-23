"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  History,
  Info,
  Lock,
  Mail,
  MoreVertical,
  Phone,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCloseTicket,
  useDeleteTicket,
  useEscalateTicket,
  useMarkRead,
  useRateTicket,
  useReopenTicket,
  useTicket,
  useTicketActivities,
  useTicketMeta,
  useUpdateTicket,
  useUploadAttachments,
  type UpdateTicketInput,
} from "@/features/tickets/api";
import { getErrorMessage } from "@/lib/errors";
import { ACTIVITY_LABELS, FIELD_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, timeAgo, toFaDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { FileUploader } from "@/components/ui/file-uploader";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { RichContent } from "@/components/ui/rich-content";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Category, TicketDetail as Ticket, TicketMeta } from "@/types";
import { AttachmentList } from "./attachments";
import { PriorityBadge, SlaDetails, SlaIndicator, TicketStatusBadge } from "./badges";
import { Conversation, ReplyBox } from "./conversation";

export function flattenCategories(nodes: Category[], depth = 0): { value: string; label: string }[] {
  return nodes.flatMap((c) => [
    { value: c.id, label: `${"— ".repeat(depth)}${c.name}` },
    ...flattenCategories(c.children ?? [], depth + 1),
  ]);
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function StaffProperties({ ticket, meta }: { ticket: Ticket; meta: TicketMeta }) {
  const update = useUpdateTicket();
  const save = (data: UpdateTicketInput, message = "تغییرات ذخیره شد") =>
    update.mutate({ id: ticket.id, data }, { onSuccess: () => toast.success(message), onError: (e) => toast.error(getErrorMessage(e)) });
  const can = ticket.can;
  const categories = flattenCategories(meta.categories);

  return (
    <div className="divide-y">
      <PropertyRow label="وضعیت">
        {can.update || can.close ? (
          <Select
            size="sm"
            value={ticket.status.id}
            options={meta.statuses.filter((s) => s.is_active !== false || s.id === ticket.status.id).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(e) => save({ status_id: e.target.value }, "وضعیت تغییر کرد")}
          />
        ) : (
          <TicketStatusBadge status={ticket.status} />
        )}
      </PropertyRow>
      <PropertyRow label="اولویت">
        {can.update ? (
          <Select size="sm" value={ticket.priority.id} options={meta.priorities.map((p) => ({ value: p.id, label: p.name }))} onChange={(e) => save({ priority_id: e.target.value }, "اولویت تغییر کرد")} />
        ) : (
          <PriorityBadge priority={ticket.priority} />
        )}
      </PropertyRow>
      <PropertyRow label="کارشناس">
        {can.assign ? (
          <Select
            size="sm"
            value={ticket.assigned_agent?.id ?? ""}
            placeholder="— بدون کارشناس —"
            options={(meta.agents ?? []).map((a) => ({ value: a.id, label: a.full_name }))}
            onChange={(e) => save(e.target.value ? { assigned_agent_id: e.target.value } : { clear_assignee: true }, "تیکت ارجاع شد")}
          />
        ) : (
          <span className="text-sm">{ticket.assigned_agent?.full_name ?? "تعیین نشده"}</span>
        )}
      </PropertyRow>
      <PropertyRow label="دپارتمان">
        {can.update ? (
          <Select size="sm" value={ticket.department?.id ?? ""} placeholder="— بدون دپارتمان —" options={meta.departments.map((d) => ({ value: d.id, label: d.name }))} onChange={(e) => save({ department_id: e.target.value || null })} />
        ) : (
          <span className="text-sm">{ticket.department?.name ?? "—"}</span>
        )}
      </PropertyRow>
      <PropertyRow label="دسته‌بندی">
        {can.update ? (
          <Select size="sm" value={ticket.category?.id ?? ""} placeholder="— بدون دسته‌بندی —" options={categories} onChange={(e) => save({ category_id: e.target.value || null })} />
        ) : (
          <span className="text-sm">{ticket.category?.name ?? "—"}</span>
        )}
      </PropertyRow>
      <PropertyRow label="موعد انجام">
        {can.update ? (
          <DatePicker
            value={ticket.due_date ? ticket.due_date.slice(0, 10) : null}
            onChange={(v) => save(v ? { due_date: `${v}T20:29:00Z` } : { clear_due_date: true }, "موعد انجام ذخیره شد")}
          />
        ) : (
          <span className="text-sm">{formatDate(ticket.due_date)}</span>
        )}
      </PropertyRow>
      <PropertyRow label="برچسب‌ها">
        {can.update && meta.tags ? (
          <TagPicker selected={ticket.tags.map((t) => t.id)} options={meta.tags} onChange={(ids) => save({ tag_ids: ids }, "برچسب‌ها ذخیره شد")} />
        ) : (
          <div className="flex flex-wrap gap-1">{ticket.tags.map((t) => <Badge key={t.id} color={t.color} size="sm">{t.name}</Badge>)}</div>
        )}
      </PropertyRow>
    </div>
  );
}

function TagPicker({ selected, options, onChange }: { selected: string[]; options: { id: string; name: string; color: string }[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-card px-2 py-1 text-start">
        {selected.length === 0 && <span className="text-xs text-muted-foreground">افزودن برچسب</span>}
        {options.filter((o) => selected.includes(o.id)).map((o) => <Badge key={o.id} color={o.color} size="sm">{o.name}</Badge>)}
        <ChevronDown className="ms-auto h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-card p-1 shadow-pop">
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id))}
                className="accent-[rgb(var(--primary))]"
              />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: o.color }} />
              {o.name}
            </label>
          ))}
          <button type="button" className="mt-1 w-full rounded-md py-1 text-xs text-primary hover:bg-muted" onClick={() => setOpen(false)}>بستن</button>
        </div>
      )}
    </div>
  );
}

function ActivityTimeline({ ticketId }: { ticketId: string }) {
  const { data, isLoading } = useTicketActivities(ticketId);
  if (isLoading) return <p className="text-xs text-muted-foreground">در حال بارگذاری...</p>;
  if (!data?.length) return <p className="text-xs text-muted-foreground">تاریخچه‌ای ثبت نشده است.</p>;
  return (
    <ol className="relative space-y-4 border-s pe-1 ps-4">
      {data.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -start-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary/60" aria-hidden />
          <p className="text-xs leading-6">
            <span className="font-medium">{a.user?.full_name ?? "سیستم"}</span> {ACTIVITY_LABELS[a.action] ?? a.action}
            {a.field && (a.old_value || a.new_value) && (
              <span className="text-muted-foreground">
                {" "}({FIELD_LABELS[a.field] ?? a.field}: {a.old_value ? `${a.old_value} ← ` : ""}{a.new_value ?? "—"})
              </span>
            )}
          </p>
          <time className="text-[0.7rem] text-muted-foreground" title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</time>
        </li>
      ))}
    </ol>
  );
}

function RatingForm({ ticket }: { ticket: Ticket }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState("");
  const rate = useRateTicket();
  if (ticket.rating) {
    return (
      <div className="text-center">
        <div className="flex justify-center gap-1" aria-label={`امتیاز ${ticket.rating.rating} از ۵`}>
          {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("h-5 w-5", i <= ticket.rating!.rating ? "fill-warning text-warning" : "text-muted-foreground/40")} />)}
        </div>
        {ticket.rating.feedback && <p className="mt-2 text-xs leading-6 text-muted-foreground">«{ticket.rating.feedback}»</p>}
        <p className="mt-1 text-xs text-success">از ثبت نظر شما سپاسگزاریم.</p>
      </div>
    );
  }
  if (!ticket.can.rate) return null;
  const labels = ["", "خیلی بد", "بد", "متوسط", "خوب", "عالی"];
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">نظر شما درباره پشتیبانی چه بود؟</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="امتیاز">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={`${toFaDigits(i)} ستاره - ${labels[i]}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(i)}
          >
            <Star className={cn("h-7 w-7 transition", i <= (hover || rating) ? "fill-warning text-warning" : "text-muted-foreground/40")} />
          </button>
        ))}
        {(hover || rating) > 0 && <span className="ms-2 text-xs text-muted-foreground">{labels[hover || rating]}</span>}
      </div>
      <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="نظر خود را بنویسید (اختیاری)" maxLength={2000} className="min-h-[72px]" />
      <Button
        className="w-full"
        disabled={!rating}
        loading={rate.isPending}
        onClick={() =>
          rate.mutate({ id: ticket.id, body: { rating, feedback: feedback || undefined } }, { onSuccess: () => toast.success("امتیاز شما ثبت شد. سپاسگزاریم!"), onError: (e) => toast.error(getErrorMessage(e)) })
        }
      >
        ثبت امتیاز
      </Button>
    </div>
  );
}

function EscalateModal({ ticket, meta, open, onClose }: { ticket: Ticket; meta: TicketMeta; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [agent, setAgent] = useState("");
  const [department, setDepartment] = useState("");
  const escalate = useEscalateTicket();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ارجاع به سطح بالاتر"
      description="تیکت با وضعیت «ارجاع شده» علامت‌گذاری و به مدیران و کارشناس جدید اطلاع داده می‌شود."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button
            variant="danger"
            loading={escalate.isPending}
            disabled={reason.trim().length < 3}
            onClick={() =>
              escalate.mutate(
                { id: ticket.id, body: { reason, assigned_agent_id: agent || null, department_id: department || null } },
                { onSuccess: () => { toast.success("تیکت به سطح بالاتر ارجاع شد"); onClose(); }, onError: (e) => toast.error(getErrorMessage(e)) },
              )
            }
          >
            ارجاع
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="دلیل ارجاع" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: نیاز به بررسی تیم فنی سطح دو" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="دپارتمان جدید (اختیاری)">
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="بدون تغییر" options={meta.departments.map((d) => ({ value: d.id, label: d.name }))} />
          </FormField>
          <FormField label="کارشناس جدید (اختیاری)">
            <Select value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="بدون تغییر" options={(meta.agents ?? []).map((a) => ({ value: a.id, label: a.full_name }))} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

function UploadModal({ ticket, meta, open, onClose }: { ticket: Ticket; meta: TicketMeta; open: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [internal, setInternal] = useState(false);
  const upload = useUploadAttachments(ticket.id);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="بارگذاری فایل"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button
            loading={upload.isPending}
            disabled={!files.length}
            onClick={() =>
              upload.mutate({ files, isInternal: internal }, { onSuccess: () => { toast.success("فایل‌ها بارگذاری شد"); setFiles([]); onClose(); }, onError: (e) => toast.error(getErrorMessage(e)) })
            }
          >
            بارگذاری
          </Button>
        </>
      }
    >
      <FileUploader files={files} onChange={setFiles} maxSizeMb={meta.settings.max_upload_size_mb} maxFiles={meta.settings.max_files} accept={meta.settings.allowed_extensions} />
      {ticket.can.internal_note && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[rgb(var(--primary))]" />
          <Lock className="h-3.5 w-3.5" /> فایل داخلی (مشتری نمی‌بیند)
        </label>
      )}
    </Modal>
  );
}

export function TicketDetailView({ id, mode }: { id: string; mode: "staff" | "portal" }) {
  const { data: ticket, isLoading, error } = useTicket(id);
  const { data: meta } = useTicketMeta();
  const markRead = useMarkRead();
  const close = useCloseTicket();
  const reopen = useReopenTicket();
  const del = useDeleteTicket();
  const confirm = useConfirm();
  const router = useRouter();
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sideTab, setSideTab] = useState<"info" | "history">("info");
  const base = mode === "portal" ? "/portal/tickets" : "/tickets";

  useEffect(() => {
    if (ticket?.id) markRead.mutate(ticket.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, ticket?.last_response_at]);

  if (isLoading) return <PageLoader />;
  if (error || !ticket) {
    return <EmptyState title="تیکت یافت نشد" description={getErrorMessage(error, "این تیکت وجود ندارد یا به آن دسترسی ندارید.")} action={<Link href={base} className="text-sm text-primary">بازگشت به فهرست تیکت‌ها</Link>} />;
  }

  const actionOpts = { onError: (e: unknown) => toast.error(getErrorMessage(e)) };
  const state = ticket.status.state;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {ticket.can.reopen && (
        <Button variant="outline" size="sm" loading={reopen.isPending} onClick={() => reopen.mutate({ id: ticket.id }, { ...actionOpts, onSuccess: () => toast.success("تیکت بازگشایی شد") })}>
          <RotateCcw className="h-4 w-4" /> بازگشایی
        </Button>
      )}
      {ticket.can.close && state !== "closed" && (
        <Button
          variant="outline"
          size="sm"
          loading={close.isPending}
          onClick={async () => {
            if (await confirm({ title: "بستن تیکت", description: "آیا از بستن این تیکت اطمینان دارید؟", tone: "primary", confirmText: "بستن تیکت" }))
              close.mutate({ id: ticket.id }, { ...actionOpts, onSuccess: () => toast.success("تیکت بسته شد") });
          }}
        >
          <XCircle className="h-4 w-4" /> بستن تیکت
        </Button>
      )}
      {mode === "staff" && (
        <Dropdown
          trigger={<Button variant="outline" size="icon-sm" aria-label="عملیات بیشتر"><MoreVertical className="h-4 w-4" /></Button>}
          items={[
            { label: "ارجاع به سطح بالاتر", icon: <ArrowUpCircle className="h-4 w-4" />, onClick: () => setEscalateOpen(true), hidden: !ticket.can.escalate },
            { label: "بارگذاری فایل", icon: <Upload className="h-4 w-4" />, onClick: () => setUploadOpen(true), hidden: !ticket.can.upload },
            { divider: true, label: "", hidden: !ticket.can.delete },
            {
              label: "حذف تیکت",
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              hidden: !ticket.can.delete,
              onClick: async () => {
                if (await confirm({ title: "حذف تیکت", description: `تیکت ${ticket.code} حذف خواهد شد. این عملیات در گزارش فعالیت‌ها ثبت می‌شود.`, confirmText: "حذف" }))
                  del.mutate({ id: ticket.id }, { ...actionOpts, onSuccess: () => { toast.success("تیکت حذف شد"); router.replace(base); } });
              },
            },
          ]}
        />
      )}
      {mode === "portal" && ticket.can.upload && (
        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> افزودن فایل</Button>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <nav className="mb-2 text-xs text-muted-foreground">
          <Link href={base} className="hover:text-foreground">{mode === "portal" ? "تیکت‌های من" : "تیکت‌ها"}</Link> / <span className="ltr inline-block">{ticket.code}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-9 sm:text-2xl">{ticket.subject}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground ltr">{ticket.code}</span>
              <TicketStatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {ticket.sla_status !== "none" && <SlaIndicator ticket={ticket} />}
              {ticket.escalation_level > 0 && <Badge tone="danger">ارجاع سطح {toFaDigits(ticket.escalation_level)}</Badge>}
              <span className="text-xs text-muted-foreground">· ایجاد {timeAgo(ticket.created_at)}</span>
            </div>
          </div>
          {actions}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {mode === "portal" && ticket.can.rate && (
            <Card className="border-warning/40 bg-warning/[0.04]">
              <CardBody><RatingForm ticket={ticket} /></CardBody>
            </Card>
          )}
          <Card>
            <div className="flex items-center gap-3 border-b px-5 py-3">
              <Avatar name={ticket.customer.full_name} src={ticket.customer.avatar_url} size="sm" />
              <div className="text-xs">
                <p className="font-semibold">{ticket.customer.full_name}</p>
                <p className="text-muted-foreground">{formatDateTime(ticket.created_at)}</p>
              </div>
            </div>
            <CardBody>
              <RichContent html={ticket.description} />
              {ticket.attachments.filter((a) => !a.message_id).length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <AttachmentList attachments={ticket.attachments.filter((a) => !a.message_id)} />
                </div>
              )}
            </CardBody>
          </Card>

          <Conversation ticket={ticket} />
          <div className="sticky bottom-3 z-10 lg:static">
            <ReplyBox ticket={ticket} maxSizeMb={meta?.settings.max_upload_size_mb} maxFiles={meta?.settings.max_files} extensions={meta?.settings.allowed_extensions} />
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <div className="flex border-b">
              {[
                { key: "info" as const, label: "جزئیات", icon: Info },
                { key: "history" as const, label: "تاریخچه", icon: History },
              ].map((t) => (
                <button key={t.key} onClick={() => setSideTab(t.key)} className={cn("flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium", sideTab === t.key ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}>
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
            </div>
            <CardBody className="p-4">
              {sideTab === "history" ? (
                <ActivityTimeline ticketId={ticket.id} />
              ) : mode === "staff" && meta ? (
                <StaffProperties ticket={ticket} meta={meta} />
              ) : (
                <div className="divide-y">
                  <PropertyRow label="وضعیت"><TicketStatusBadge status={ticket.status} /></PropertyRow>
                  <PropertyRow label="اولویت"><PriorityBadge priority={ticket.priority} /></PropertyRow>
                  <PropertyRow label="دپارتمان"><span className="text-sm">{ticket.department?.name ?? "—"}</span></PropertyRow>
                  <PropertyRow label="دسته‌بندی"><span className="text-sm">{ticket.category?.name ?? "—"}</span></PropertyRow>
                  <PropertyRow label="کارشناس"><span className="text-sm">{ticket.assigned_agent?.full_name ?? "در انتظار تخصیص"}</span></PropertyRow>
                  <PropertyRow label="آخرین پاسخ"><span className="text-sm">{timeAgo(ticket.last_response_at)}</span></PropertyRow>
                </div>
              )}
            </CardBody>
          </Card>

          {mode === "staff" && (
            <Card>
              <CardHeader title="مشتری" />
              <CardBody className="space-y-2 p-4 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={ticket.customer.full_name} src={ticket.customer.avatar_url} size="md" />
                  <Link href={`/customers/${ticket.customer.id}`} className="font-semibold hover:text-primary">{ticket.customer.full_name}</Link>
                </div>
                {ticket.customer.mobile && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span className="ltr">{toFaDigits(ticket.customer.mobile)}</span></p>}
                {ticket.customer.email && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /><span className="ltr">{ticket.customer.email}</span></p>}
                <Link href={`/tickets?customer_id=${ticket.customer.id}`} className="inline-block text-xs text-primary hover:underline">مشاهده سایر تیکت‌های این مشتری</Link>
              </CardBody>
            </Card>
          )}

          {mode === "staff" && (
            <Card>
              <CardHeader title="SLA" icon={<CalendarClock className="h-4 w-4" />} />
              <CardBody className="p-4"><SlaDetails ticket={ticket} /></CardBody>
            </Card>
          )}

          {mode === "staff" && ticket.rating && (
            <Card>
              <CardHeader title="رضایت مشتری" icon={<CheckCircle2 className="h-4 w-4" />} />
              <CardBody className="p-4"><RatingForm ticket={ticket} /></CardBody>
            </Card>
          )}
          {mode === "portal" && ticket.rating && (
            <Card><CardBody className="p-4"><RatingForm ticket={ticket} /></CardBody></Card>
          )}
        </aside>
      </div>

      {meta && <EscalateModal ticket={ticket} meta={meta} open={escalateOpen} onClose={() => setEscalateOpen(false)} />}
      {meta && <UploadModal ticket={ticket} meta={meta} open={uploadOpen} onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
