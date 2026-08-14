/**
 * Document-style email message card for Unified Inbox (Gmail/Outlook-like).
 * Full center-pane width — never uses chat-bubble max-width.
 */
import { format } from "date-fns";
import { Loader2, MoreVertical, Trash2 } from "lucide-react";
import { EmailMessageBody } from "@/components/inbox/EmailMessageBody";
import { EmailAttachmentsSection } from "@/components/inbox/conversation/EmailAttachmentsSection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EMAIL_DOCUMENT_MAX_WIDTH_CLASS } from "@/lib/inboxConversationPresentation";

export type EmailThreadMessageModel = {
  id: string;
  direction: "inbound" | "outbound" | string;
  content?: string | null;
  createdAt: string | Date;
  status?: string | null;
  sentViaFallback?: boolean | null;
  fallbackChannel?: string | null;
};

export function EmailThreadMessage({
  message,
  contactEmail,
  trashPending,
  onRequestTrash,
}: {
  message: EmailThreadMessageModel;
  contactEmail?: string | null;
  trashPending?: boolean;
  onRequestTrash?: () => void;
}) {
  const isOut = message.direction === "outbound";
  const isSending = message.status === "sending";

  return (
    <div
      className={cn("flex min-w-0 w-full animate-msg-in", EMAIL_DOCUMENT_MAX_WIDTH_CLASS)}
      data-testid={`email-thread-message-${message.id}`}
      data-conversation-layout="email-document"
      data-message-direction={isOut ? "outbound" : "inbound"}
    >
      <article
        className={cn(
          "w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-white shadow-sm",
          isOut ? "border-emerald-100/90" : "border-gray-200",
          isSending && "opacity-75",
        )}
        data-testid="email-document-card"
      >
        <header
          className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 bg-slate-50/80 px-3 py-2.5 sm:px-5"
          data-testid="email-document-header"
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  isOut ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-900",
                )}
              >
                {isOut ? "Sent" : "Received"}
              </span>
              <span className="text-xs text-gray-500">
                {format(new Date(message.createdAt), "MMM d, yyyy · h:mm a")}
              </span>
            </div>
            {contactEmail ? (
              <p className="truncate text-xs text-gray-600">
                <span className="text-gray-400">{isOut ? "To" : "From"}</span>{" "}
                <span className="text-gray-800">{contactEmail}</span>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {message.sentViaFallback ? (
              <span className="text-[10px] text-amber-600">via {message.fallbackChannel}</span>
            ) : null}
            {isOut && isSending ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> : null}
            {isOut && message.status === "failed" ? (
              <span className="text-[10px] font-medium text-red-500">Not sent</span>
            ) : null}
            {onRequestTrash && !message.id.startsWith("optimistic-") ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Email actions"
                    aria-label="Email actions"
                    data-testid={`button-email-message-menu-${message.id}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    data-testid={`menu-delete-email-message-${message.id}`}
                    disabled={trashPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestTrash();
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Move to Trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </header>

        <div
          className="min-w-0 w-full max-w-full overflow-x-auto px-3 py-3 sm:px-5 sm:py-4"
          data-testid="email-document-body-wrap"
        >
          <EmailMessageBody
            messageId={message.id}
            fallbackText={message.content || ""}
            layout="document"
            className="w-full max-w-full"
          />
        </div>

        <EmailAttachmentsSection messageId={message.id} />
      </article>
    </div>
  );
}
