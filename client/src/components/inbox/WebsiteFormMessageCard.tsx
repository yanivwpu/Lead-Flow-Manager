/**
 * Polished renderer for inbound website form notifications (sourceType = website_form).
 * Visitor message is primary; raw notification remains available under Details.
 */

import { useState } from "react";
import { ChevronDown, FileInput, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { compactSourcePageLabel } from "@shared/websiteFormEmail";

export type WebsiteFormMetaView = {
  sourceType: "website_form";
  formType?: string | null;
  formName?: string | null;
  sourcePageUrl?: string | null;
  submittedAt?: string | null;
  visitorName?: string | null;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
  visitorMessage?: string | null;
  structuredFields?: Record<string, string>;
  notificationFromEmail?: string | null;
  notificationFromName?: string | null;
  classificationConfidence?: number;
};

function formatSubmittedAt(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return raw.trim();
}

export function WebsiteFormMessageCard({
  meta,
  emailSubject,
  className,
}: {
  meta: WebsiteFormMetaView;
  emailSubject?: string | null;
  className?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const visitorName = meta.visitorName?.trim() || null;
  const visitorEmail = meta.visitorEmail?.trim() || null;
  const visitorPhone = meta.visitorPhone?.trim() || null;
  const message =
    meta.visitorMessage?.trim() ||
    meta.structuredFields?.message?.trim() ||
    null;
  const formSubject =
    meta.structuredFields?.subject?.trim() ||
    (emailSubject && !/contact\s+form/i.test(emailSubject) ? emailSubject : null);
  const pageLabel = compactSourcePageLabel(meta.sourcePageUrl);
  const submittedLabel = formatSubmittedAt(meta.submittedAt);
  const formTitle = meta.formName || "Contact Form";

  const extraFields = Object.entries(meta.structuredFields || {}).filter(
    ([key]) =>
      !["name", "email", "phone", "subject", "message", "pageUrl", "submittedAt"].includes(key),
  );

  return (
    <div
      className={cn(
        "w-full max-w-xl rounded-lg border border-sky-200/80 bg-gradient-to-b from-sky-50/90 to-white text-left shadow-sm",
        className,
      )}
      data-testid="website-form-message-card"
      role="article"
      aria-label="Website form submission"
    >
      <div className="flex items-start gap-2.5 border-b border-sky-100 px-3.5 py-2.5">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-800"
          aria-hidden
        >
          <FileInput className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800/90">
            New Contact Form Submission
          </p>
          <p className="truncate text-sm font-semibold text-gray-900" data-testid="form-visitor-identity">
            {[visitorName, visitorEmail].filter(Boolean).join(" · ") || formTitle}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
            {visitorEmail ? (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="h-3 w-3 shrink-0" aria-hidden />
                {visitorEmail}
              </span>
            ) : null}
            {visitorPhone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" aria-hidden />
                {visitorPhone}
              </span>
            ) : null}
            <span className="text-gray-500">{formTitle}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        {formSubject ? (
          <p className="text-xs text-gray-600">
            <span className="font-medium text-gray-700">Subject:</span> {formSubject}
          </p>
        ) : null}

        {message ? (
          <blockquote
            className="rounded-md border border-gray-200/80 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 whitespace-pre-wrap [overflow-wrap:anywhere]"
            data-testid="form-visitor-message"
          >
            {message}
          </blockquote>
        ) : (
          <p className="text-sm text-gray-600">No message body was detected in this form submission.</p>
        )}

        {(pageLabel || submittedLabel) && (
          <p className="text-[11px] text-gray-500" data-testid="form-compact-meta">
            {[
              pageLabel ? `Submitted from ${pageLabel}` : null,
              submittedLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger
          type="button"
          className="flex w-full items-center justify-between border-t border-sky-100 px-3.5 py-2 text-left text-xs font-medium text-sky-900 hover:bg-sky-50/80"
          data-testid="form-details-toggle"
        >
          Details
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")}
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-sky-50 bg-sky-50/40 px-3.5 py-2.5 text-[11px] text-gray-600 space-y-1.5">
          {meta.sourcePageUrl ? (
            <p className="break-all">
              <span className="font-medium text-gray-700">Page URL:</span>{" "}
              <a
                href={meta.sourcePageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-800 underline"
              >
                {meta.sourcePageUrl}
              </a>
            </p>
          ) : null}
          {meta.notificationFromEmail ? (
            <p>
              <span className="font-medium text-gray-700">Notification sender:</span>{" "}
              {[meta.notificationFromName, meta.notificationFromEmail].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {meta.submittedAt ? (
            <p>
              <span className="font-medium text-gray-700">Submitted at:</span> {meta.submittedAt}
            </p>
          ) : null}
          {extraFields.map(([key, value]) => (
            <p key={key} className="break-words whitespace-pre-wrap">
              <span className="font-medium text-gray-700">
                {key.startsWith("extra:") ? key.slice(6) : key}:
              </span>{" "}
              {value}
            </p>
          ))}
          <p className="text-gray-500">
            Original notification is preserved on this email for audit. Reply goes to the visitor
            address when Reply-To is present.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
