import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  WebsiteFormMessageCard,
  type WebsiteFormMetaView,
} from "./WebsiteFormMessageCard";
import { EmailHtmlFrame } from "./EmailHtmlFrame";
import { EmailBodyLoading } from "./EmailBodyLoading";

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
type EmailMessageBodyProps = {
  messageId: string;
  fallbackText: string;
  className?: string;
  /** document = show subject/from meta above body (email reader) */
  layout?: "inline" | "document";
};

export function EmailMessageBody(props: EmailMessageBodyProps) {
  // A new message owns its query observer, image retry and frame lifecycle.
  return <EmailMessageBodyContent key={props.messageId} {...props} />;
}

function EmailMessageBodyContent({
  messageId,
  fallbackText,
  className,
  layout = "inline",
}: EmailMessageBodyProps) {
  const retriedFailedImage = useRef(false);
  const enabled = !!messageId && !messageId.startsWith("optimistic-");
  const { data, isPending, refetch } = useQuery<EmailDetailsResponse>({
    queryKey: ["/api/messages", messageId, "email-details"],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/messages/${messageId}/email-details`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!res.ok) throw new Error("Failed to load email details");
      return res.json();
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const refreshAfterImageError = useCallback(() => {
    if (retriedFailedImage.current) return;
    retriedFailedImage.current = true;
    void refetch();
  }, [refetch]);

  const detail = data?.detail;
  const formMeta = data?.formMeta || detail?.formMeta || null;
  const html = detail?.htmlBody?.trim();
  const text = detail?.textBody?.trim() || fallbackText;

  // Until details resolve, a preview cannot tell us whether this is HTML or text.
  // Disabled optimistic messages and failed requests retain their text fallback.
  if (enabled && isPending) {
    return <EmailBodyLoading className={className} />;
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
        <EmailHtmlFrame
          html={html}
          className="w-full max-w-full"
          onImageError={refreshAfterImageError}
        />
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
