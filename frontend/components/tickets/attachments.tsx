"use client";
import { useEffect, useState } from "react";
import { Download, Eye, FileArchive, FileSpreadsheet, FileText, ImageIcon, Lock } from "lucide-react";
import { toast } from "sonner";
import { downloadFile, fetchBlobUrl } from "@/lib/api";
import { getErrorMessageAsync } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import type { Attachment } from "@/types";

function iconFor(a: Attachment) {
  if (a.is_image) return ImageIcon;
  if (a.mime_type.includes("sheet") || a.mime_type.includes("excel")) return FileSpreadsheet;
  if (a.mime_type.includes("zip")) return FileArchive;
  return FileText;
}

/** Image thumbnail fetched with auth (attachments are never public URLs). */
function Thumb({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    fetchBlobUrl(`/attachments/${attachment.id}?inline=true`)
      .then((u) => {
        revoked = u;
        setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [attachment.id]);
  if (!url) return <div className="flex h-20 w-28 items-center justify-center rounded-lg bg-muted"><Spinner className="h-4 w-4" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={attachment.original_name} className="h-20 w-28 rounded-lg border object-cover" />;
}

export function AttachmentPreview({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!attachment) return;
    let created: string | null = null;
    setUrl(null);
    fetchBlobUrl(`/attachments/${attachment.id}?inline=true`)
      .then((u) => {
        created = u;
        setUrl(u);
      })
      .catch(async (e) => toast.error(await getErrorMessageAsync(e)));
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
  }, [attachment]);
  return (
    <Modal open={!!attachment} onClose={onClose} size="xl" title={attachment?.original_name}>
      <div className="flex min-h-[50vh] items-center justify-center">
        {!url && <Spinner className="h-6 w-6" />}
        {url && attachment?.is_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={attachment.original_name} className="max-h-[70vh] max-w-full rounded-lg" />
        )}
        {url && attachment && !attachment.is_image && <iframe src={url} title={attachment.original_name} className="h-[70vh] w-full rounded-lg border" />}
      </div>
    </Modal>
  );
}

export function AttachmentList({ attachments, showThumbs = true }: { attachments: Attachment[]; showThumbs?: boolean }) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!attachments.length) return null;
  const download = async (a: Attachment) => {
    try {
      await downloadFile(`/attachments/${a.id}`, a.original_name);
    } catch (e) {
      toast.error(await getErrorMessageAsync(e));
    }
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => {
          const Icon = iconFor(a);
          return (
            <div key={a.id} className="group flex max-w-full items-center gap-2 rounded-lg border bg-card p-1.5 pe-2 text-xs">
              {showThumbs && a.is_image ? (
                <button type="button" onClick={() => setPreview(a)} aria-label={`پیش‌نمایش ${a.original_name}`}>
                  <Thumb attachment={a} />
                </button>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
              )}
              <div className="min-w-0">
                <p className="max-w-[12rem] truncate font-medium ltr text-start" title={a.original_name}>{a.original_name}</p>
                <p className="flex items-center gap-1 text-muted-foreground">
                  {formatBytes(a.size)}
                  {a.is_internal && <Lock className="h-3 w-3" aria-label="داخلی" />}
                </p>
              </div>
              <div className="flex items-center">
                {a.previewable && (
                  <button type="button" onClick={() => setPreview(a)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="پیش‌نمایش">
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => download(a)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="دانلود">
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />
    </>
  );
}
