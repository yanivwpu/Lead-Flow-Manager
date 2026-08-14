/**
 * Full-width regular email attachments section (outside HTML body).
 * CID/inline images stay in EmailMessageBody; remote images stay in the proxy path.
 */
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, FileWarning, Image as ImageIcon, Paperclip } from "lucide-react";
import type { NormalizedEmailAttachmentMeta } from "@shared/emailChannel";
import {
  buildEmailAttachmentPath,
  emailAttachmentFileKind,
  formatEmailAttachmentSize,
  isEmailAttachmentInlinePreviewMime,
  listRegularEmailAttachments,
  normalizeAttachmentMime,
} from "@shared/emailAttachmentPolicy";
import { cn } from "@/lib/utils";

type EmailDetailsResponse = {
  detail?: {
    hasAttachments?: boolean;
    attachmentMetadata?: unknown;
  };
};

function AttachmentIcon({ kind }: { kind: ReturnType<typeof emailAttachmentFileKind> }) {
  if (kind === "image") return <ImageIcon className="h-4 w-4 text-sky-700" aria-hidden />;
  if (kind === "pdf") return <FileText className="h-4 w-4 text-rose-700" aria-hidden />;
  if (kind === "document") return <FileText className="h-4 w-4 text-slate-600" aria-hidden />;
  return <FileWarning className="h-4 w-4 text-amber-700" aria-hidden />;
}

function EmailAttachmentCard({
  messageId,
  att,
}: {
  messageId: string;
  att: NormalizedEmailAttachmentMeta;
}) {
  const mime = normalizeAttachmentMime(att.mimeType);
  const kind = emailAttachmentFileKind(att.mimeType, att.filename);
  const sizeLabel = formatEmailAttachmentSize(att.size ?? null);
  const previewUrl = buildEmailAttachmentPath(messageId, att.providerAttachmentId);
  const downloadUrl = buildEmailAttachmentPath(messageId, att.providerAttachmentId, {
    download: true,
  });
  const showImagePreview = isEmailAttachmentInlinePreviewMime(att.mimeType);

  return (
    <div
      className="flex min-w-0 w-full max-w-full flex-col gap-2 rounded-lg border border-gray-200 bg-slate-50/80 p-3 sm:flex-row sm:items-start"
      data-testid="email-attachment-card"
      data-attachment-kind={kind}
      data-mime={mime || "unknown"}
    >
      {showImagePreview ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white"
          title={`Preview ${att.filename}`}
          data-testid="email-attachment-preview-link"
        >
          <img
            src={previewUrl}
            alt={att.filename}
            className="h-24 w-32 object-cover"
            loading="lazy"
            data-testid="email-attachment-thumbnail"
          />
        </a>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
          <AttachmentIcon kind={kind} />
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className="truncate text-sm font-medium text-gray-900"
          title={att.filename}
          data-testid="email-attachment-filename"
        >
          {att.filename}
        </p>
        <p className="text-xs text-gray-500" data-testid="email-attachment-meta">
          {[mime || kind, sizeLabel].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap gap-2 pt-0.5">
          {mayOpenInline(kind, mime) ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              data-testid="email-attachment-open"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          ) : null}
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            data-testid="email-attachment-download"
          >
            <Download className="h-3 w-3" />
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

function mayOpenInline(kind: ReturnType<typeof emailAttachmentFileKind>, mime: string): boolean {
  if (kind === "image" || kind === "pdf") return true;
  if (mime === "application/pdf") return true;
  return false;
}

export function EmailAttachmentsSection({
  messageId,
  className,
}: {
  messageId: string;
  className?: string;
}) {
  const enabled = !!messageId && !messageId.startsWith("optimistic-");
  const { data, isLoading, isError } = useQuery<EmailDetailsResponse>({
    queryKey: ["/api/messages", messageId, "email-details"],
    queryFn: async () => {
      const res = await fetch(`/api/messages/${messageId}/email-details`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load email details");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });

  const attachments = listRegularEmailAttachments(data?.detail?.attachmentMetadata);

  if (!enabled) return null;
  if (isLoading && !data) {
    return (
      <div
        className={cn("w-full max-w-full border-t border-gray-100 px-3 py-3 sm:px-5", className)}
        data-testid="email-attachments-loading"
      >
        <p className="text-xs text-muted-foreground">Checking attachments…</p>
      </div>
    );
  }
  if (isError) {
    return null;
  }
  if (attachments.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "w-full min-w-0 max-w-full border-t border-gray-100 bg-white px-3 py-3 sm:px-5 sm:py-4",
        className,
      )}
      data-testid="email-attachments-section"
      data-attachment-count={attachments.length}
      aria-label="Email attachments"
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Paperclip className="h-3.5 w-3.5" aria-hidden />
        Attachments ({attachments.length})
      </div>
      <div className="flex w-full max-w-full flex-col gap-2">
        {attachments.map((att) => (
          <EmailAttachmentCard
            key={att.providerAttachmentId}
            messageId={messageId}
            att={att}
          />
        ))}
      </div>
    </section>
  );
}
