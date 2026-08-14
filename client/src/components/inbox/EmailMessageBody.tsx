import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  WebsiteFormMessageCard,
  type WebsiteFormMetaView,
} from "./WebsiteFormMessageCard";
import { EmailHtmlFrame } from "./EmailHtmlFrame";

type EmailDetail = {
  subject?: string | null;
  htmlBody?: string | null;
  textBody?: string | null;
  fromAddress?: string | null;
  replyToAddress?: string | null;
  snippet?: string | null;
  sourceType?: string | null;
  formMeta?: WebsiteFormMetaView | null;
};

type EmailDetailsResponse = {
  detail: EmailDetail;
  formMeta?: WebsiteFormMetaView | null;
  replyTarget?: {
    email: string | null;
    name: string | null;
    source: string;
    unsafe: boolean;
    warning: string | null;
  };
};

/**
 * Renders email HTML from `/api/messages/:id/email-details` inside a sandboxed iframe
 * so third-party `<style>` rules cannot leak into Inbox chrome.
 * Website-form notifications use the dedicated form card when classified.
 */
export function EmailMessageBody({
  messageId,
  fallbackText,
  className,
  layout = "inline",
}: {
  messageId: string;
  fallbackText: string;
  className?: string;
  /** document = show subject/from meta above body (email reader) */
  layout?: "inline" | "document";
}) {
  const { data, isLoading } = useQuery<EmailDetailsResponse>({
    queryKey: ["/api/messages", messageId, "email-details"],
    queryFn: async () => {
      const res = await fetch(`/api/messages/${messageId}/email-details`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load email details");
      return res.json();
    },
    enabled: !!messageId && !messageId.startsWith("optimistic-"),
    staleTime: 60_000,
  });

  const detail = data?.detail;
  const formMeta = data?.formMeta || detail?.formMeta || null;
  const html = detail?.htmlBody?.trim();
  const text = detail?.textBody?.trim() || fallbackText;

  if (isLoading && !fallbackText) {
    return <p className={cn("text-xs text-muted-foreground", className)}>Loading email…</p>;
  }

  if (formMeta?.sourceType === "website_form" && (formMeta.visitorMessage || formMeta.visitorEmail)) {
    return (
      <WebsiteFormMessageCard
        meta={formMeta}
        emailSubject={detail?.subject}
        className={className}
      />
    );
  }

  const meta =
    layout === "document" ? (
      <div className="mb-3 space-y-1" data-testid="email-document-meta">
        {detail?.subject ? (
          <h4 className="text-sm font-semibold text-gray-900 [overflow-wrap:anywhere] break-words">
            {detail.subject}
          </h4>
        ) : null}
        {detail?.fromAddress ? (
          <p className="text-xs text-gray-600 [overflow-wrap:anywhere] break-words">
            <span className="text-gray-400">From</span> {detail.fromAddress}
          </p>
        ) : null}
        {detail?.replyToAddress && detail.replyToAddress !== detail.fromAddress ? (
          <p className="text-xs text-gray-500 [overflow-wrap:anywhere] break-words">
            <span className="text-gray-400">Reply-To</span> {detail.replyToAddress}
          </p>
        ) : null}
      </div>
    ) : null;

  if (html) {
    return (
      <div className={cn("w-full max-w-full min-w-0", className)} data-testid="email-message-body">
        {meta}
        <EmailHtmlFrame html={html} className="w-full max-w-full" />
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-full min-w-0", className)} data-testid="email-message-body">
      {meta}
      <pre
        className="whitespace-pre-wrap font-sans text-sm text-gray-800 [overflow-wrap:anywhere] break-words"
        data-testid="email-text-body"
      >
        {text}
      </pre>
    </div>
  );
}
