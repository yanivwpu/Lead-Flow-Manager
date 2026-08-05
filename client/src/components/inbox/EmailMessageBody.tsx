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
}: {
  messageId: string;
  fallbackText: string;
  className?: string;
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

  if (html) {
    return <EmailHtmlFrame html={html} className={className} />;
  }

  return (
    <pre
      className={cn(
        "whitespace-pre-wrap font-sans text-sm text-gray-800 [overflow-wrap:anywhere] break-words",
        className,
      )}
      data-testid="email-text-body"
    >
      {text}
    </pre>
  );
}
