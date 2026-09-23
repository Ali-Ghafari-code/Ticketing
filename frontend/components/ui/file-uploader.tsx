"use client";
import { useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, toFaDigits } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxSizeMb?: number;
  maxFiles?: number;
  accept?: string[];
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

export const DEFAULT_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "zip", "txt"];

export function FileUploader({
  files,
  onChange,
  maxSizeMb = 10,
  maxFiles = 5,
  accept = DEFAULT_EXTENSIONS,
  compact,
  disabled,
  className,
}: FileUploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const add = (list: FileList | File[]) => {
    const next = [...files];
    for (const file of Array.from(list)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!accept.includes(ext)) {
        toast.error(`فرمت فایل «${file.name}» مجاز نیست.`);
        continue;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`حجم «${file.name}» بیش از ${toFaDigits(maxSizeMb)} مگابایت است.`);
        continue;
      }
      if (next.length >= maxFiles) {
        toast.error(`حداکثر ${toFaDigits(maxFiles)} فایل مجاز است.`);
        break;
      }
      if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    }
    onChange(next);
  };

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      accept={accept.map((a) => `.${a}`).join(",")}
      onChange={(e) => {
        if (e.target.files) add(e.target.files);
        e.target.value = "";
      }}
    />
  );

  const list = files.length > 0 && (
    <ul className="mt-2 space-y-1.5">
      {files.map((file, i) => (
        <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          {file.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
          <span className="flex-1 truncate ltr text-start">{file.name}</span>
          <span className="text-muted-foreground">{formatBytes(file.size)}</span>
          <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))} className="rounded p-0.5 hover:bg-muted" aria-label={`حذف ${file.name}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );

  if (compact) {
    return (
      <div className={className}>
        {picker}
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          title="پیوست فایل"
        >
          <Paperclip className="h-4 w-4" />
          پیوست
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {picker}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-muted/40",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <UploadCloud className="mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">فایل را اینجا رها کنید یا برای انتخاب کلیک کنید</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          حداکثر {toFaDigits(maxFiles)} فایل، هر فایل تا {toFaDigits(maxSizeMb)} مگابایت
          <br />
          فرمت‌های مجاز: <span className="ltr inline-block">{accept.join(", ")}</span>
        </p>
      </div>
      {list}
    </div>
  );
}

export function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((file, i) => (
        <span key={`${file.name}-${i}`} className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate ltr">{file.name}</span>
          <button type="button" onClick={() => onRemove(i)} aria-label="حذف" className="rounded hover:bg-muted">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
