"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Lock, MoreHorizontal, Pencil, Search, Send, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useDeleteMessage, useEditMessage, useSendMessage, useTicketMessages } from "@/features/tickets/api";
import { searchMentionable } from "@/features/users/api";
import { useDebounce } from "@/hooks/use-debounce";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, formatTime, formatDate } from "@/lib/format";
import { cn, stripHtml } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { FileUploader, PendingFiles } from "@/components/ui/file-uploader";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { RichContent } from "@/components/ui/rich-content";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/store/auth";
import type { TicketDetail, TicketMessage } from "@/types";
import { AttachmentList } from "./attachments";

function MessageBubble({ message, ticketId, mine }: { message: TicketMessage; ticketId: string; mine: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const edit = useEditMessage(ticketId);
  const remove = useDeleteMessage(ticketId);
  const confirm = useConfirm();
  const author = message.author;
  const isCustomer = author?.user_type === "customer";

  if (message.kind === "system") {
    return (
      <div className="flex justify-center" id={`m-${message.id}`}>
        <div className="flex max-w-xl items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <RichContent html={message.body} className="text-xs leading-6" />
            <span className="text-[0.7rem]">{author?.full_name} · {formatDateTime(message.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`m-${message.id}`} className={cn("group flex gap-3", mine && !message.is_internal && "flex-row-reverse")}>
      <Avatar name={author?.full_name ?? "کاربر حذف شده"} src={author?.avatar_url} size="sm" className="mt-1" />
      <div className={cn("min-w-0 max-w-[min(42rem,100%)] flex-1 sm:flex-none", mine && !message.is_internal && "items-end")}>
        <div className={cn("mb-1 flex flex-wrap items-center gap-2 text-xs", mine && !message.is_internal && "flex-row-reverse")}>
          <span className="font-semibold">{author?.full_name ?? "کاربر حذف شده"}</span>
          {!isCustomer && author && <span className="rounded bg-primary/10 px-1.5 text-[0.65rem] text-primary">پشتیبانی</span>}
          {message.is_internal && (
            <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 text-[0.65rem] font-medium text-warning">
              <Lock className="h-3 w-3" /> یادداشت داخلی — مشتری نمی‌بیند
            </span>
          )}
          <time className="text-muted-foreground" dateTime={message.created_at} title={formatDateTime(message.created_at)}>
            {formatTime(message.created_at)}
          </time>
          {message.edited_at && !message.deleted_at && <span className="text-[0.65rem] text-muted-foreground">(ویرایش شده)</span>}
        </div>
        <div
          className={cn(
            "relative rounded-2xl border px-4 py-3",
            message.deleted_at && "border-dashed bg-transparent italic text-muted-foreground",
            !message.deleted_at && message.is_internal && "border-warning/30 bg-warning/[0.06]",
            !message.deleted_at && !message.is_internal && (mine ? "border-primary/20 bg-primary/[0.06]" : "bg-card"),
          )}
        >
          {message.deleted_at ? (
            <p className="text-sm">این پیام حذف شده است.</p>
          ) : editing ? (
            <div className="space-y-2">
              <RichTextEditor value={draft} onChange={setDraft} minimal />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /> انصراف</Button>
                <Button
                  size="sm"
                  loading={edit.isPending}
                  onClick={() =>
                    edit.mutate(
                      { id: message.id, body: draft },
                      { onSuccess: () => { setEditing(false); toast.success("پیام ویرایش شد"); }, onError: (e) => toast.error(getErrorMessage(e)) },
                    )
                  }
                >
                  <Check className="h-4 w-4" /> ذخیره
                </Button>
              </div>
            </div>
          ) : (
            <RichContent html={message.body} />
          )}
          {!message.deleted_at && message.attachments.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <AttachmentList attachments={message.attachments} />
            </div>
          )}
          {(message.can_edit || message.can_delete) && !editing && !message.deleted_at && (
            <div className="absolute top-2 end-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <Dropdown
                trigger={<button className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="گزینه‌های پیام"><MoreHorizontal className="h-4 w-4" /></button>}
                items={[
                  { label: "ویرایش", icon: <Pencil className="h-4 w-4" />, onClick: () => { setDraft(message.body); setEditing(true); }, hidden: !message.can_edit },
                  {
                    label: "حذف",
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    hidden: !message.can_delete,
                    onClick: async () => {
                      if (await confirm({ title: "حذف پیام", description: "این پیام برای همه به عنوان «حذف شده» نمایش داده می‌شود." })) {
                        remove.mutate(message.id, { onSuccess: () => toast.success("پیام حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) });
                      }
                    },
                  },
                ]}
              />
            </div>
          )}
        </div>
        {mine && !message.is_internal && !message.deleted_at && (
          <p className={cn("mt-1 flex items-center gap-1 text-[0.65rem] text-muted-foreground", "justify-end")}>
            {message.is_read ? <><CheckCheck className="h-3.5 w-3.5 text-primary" /> خوانده شد</> : <><Check className="h-3.5 w-3.5" /> ارسال شد</>}
          </p>
        )}
      </div>
    </div>
  );
}

export function ReplyBox({ ticket, maxSizeMb, maxFiles, extensions }: { ticket: TicketDetail; maxSizeMb?: number; maxFiles?: number; extensions?: string[] }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const canNote = ticket.can.internal_note;
  const [mode, setMode] = useState<"reply" | "note">(ticket.can.reply ? "reply" : "note");
  const send = useSendMessage(ticket.id);
  const storageKey = `draft:${ticket.id}:${mode}`;

  useEffect(() => {
    try {
      setBody(localStorage.getItem(storageKey) ?? "");
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (body) localStorage.setItem(storageKey, body);
        else localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [body, storageKey]);

  if (!ticket.can.reply && !canNote) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
        امکان ارسال پاسخ برای این تیکت وجود ندارد.
      </div>
    );
  }

  const submit = () => {
    if (!stripHtml(body) && !files.length) return toast.error("متن پیام را بنویسید یا فایلی پیوست کنید.");
    send.mutate(
      { body, isInternal: mode === "note", files },
      {
        onSuccess: () => {
          setBody("");
          setFiles([]);
          localStorage.removeItem(storageKey);
          toast.success(mode === "note" ? "یادداشت داخلی ثبت شد" : "پاسخ ارسال شد");
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };

  return (
    <div className={cn("rounded-xl border bg-card shadow-soft", mode === "note" && "border-warning/40")}>
      {canNote && (
        <div className="flex gap-1 border-b px-2 pt-2">
          {ticket.can.reply && (
            <button type="button" onClick={() => setMode("reply")} className={cn("rounded-t-lg px-3 py-2 text-xs font-medium", mode === "reply" ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}>
              پاسخ به مشتری
            </button>
          )}
          <button type="button" onClick={() => setMode("note")} className={cn("inline-flex items-center gap-1 rounded-t-lg px-3 py-2 text-xs font-medium", mode === "note" ? "border-b-2 border-warning text-warning" : "text-muted-foreground")}>
            <Lock className="h-3 w-3" /> یادداشت داخلی
          </button>
        </div>
      )}
      <div className="p-3">
        <RichTextEditor
          value={body}
          onChange={setBody}
          minimal
          placeholder={mode === "note" ? "یادداشت داخلی (فقط برای تیم پشتیبانی قابل مشاهده است). برای اشاره از @ استفاده کنید." : "پاسخ خود را بنویسید..."}
          mentionSource={canNote ? searchMentionable : undefined}
          className={cn("border-0 focus-within:ring-0", mode === "note" && "bg-warning/[0.04]")}
          editorClassName="min-h-[110px]"
          onSubmitShortcut={submit}
        />
        <PendingFiles files={files} onRemove={(i) => setFiles(files.filter((_, idx) => idx !== i))} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
        <FileUploader files={files} onChange={setFiles} compact maxSizeMb={maxSizeMb} maxFiles={maxFiles} accept={extensions} disabled={!ticket.can.upload} />
        <div className="flex items-center gap-2">
          <span className="hidden text-[0.7rem] text-muted-foreground sm:inline ltr">Ctrl + Enter</span>
          <Button onClick={submit} loading={send.isPending} variant={mode === "note" ? "secondary" : "primary"}>
            <Send className="h-4 w-4 -scale-x-100" />
            {mode === "note" ? "ثبت یادداشت" : "ارسال پاسخ"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Conversation({ ticket }: { ticket: TicketDetail }) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const debounced = useDebounce(q.trim(), 400);
  const { data, isLoading } = useTicketMessages(ticket.id, debounced || undefined);
  const me = useAuthStore((s) => s.user);
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.length ?? 0;

  useEffect(() => {
    if (!debounced && count) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count, debounced]);

  const groups = useMemo(() => {
    const out: { day: string; items: TicketMessage[] }[] = [];
    (data ?? []).forEach((m) => {
      const day = formatDate(m.created_at);
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(m);
    });
    return out;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">گفتگو</h2>
        {searching ? (
          <div className="flex w-full max-w-xs items-center gap-1">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در پیام‌ها..." icon={<Search className="h-4 w-4" />} className="h-8" />
            <Button size="icon-sm" variant="ghost" onClick={() => { setQ(""); setSearching(false); }} aria-label="بستن جستجو"><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setSearching(true)}><Search className="h-4 w-4" /> جستجو در پیام‌ها</Button>
        )}
      </div>
      {isLoading && <SkeletonRows rows={3} />}
      {debounced && data && data.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">پیامی با این عبارت یافت نشد.</p>}
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.day} className="space-y-5">
            <div className="flex items-center gap-3 text-[0.7rem] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {g.day}
              <span className="h-px flex-1 bg-border" />
            </div>
            {g.items.map((m) => (
              <MessageBubble key={m.id} message={m} ticketId={ticket.id} mine={m.author?.id === me?.id} />
            ))}
          </section>
        ))}
      </div>
      <div ref={endRef} />
    </div>
  );
}
