import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ReplyActivity } from "@/lib/useInboxCollaboration";

export function InboxReplyConflict({
  code,
  latestReply,
  onReview,
}: {
  code: string | null;
  latestReply?: ReplyActivity | null;
  onReview: () => void;
}) {
  const { t, i18n } = useTranslation();
  if (!code) return null;
  const key =
    code === "reply_state_unavailable"
      ? "stateUnavailable"
      : code === "delivery_unknown"
      ? "unknown"
      : code === "send_in_progress"
        ? "busy"
        : code === "reviewed"
          ? "reviewed"
          : "conflict";
  return (
    <div
      role="alert"
      className="my-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950"
      data-testid="inbox-reply-conflict"
    >
      <p>{t(`inboxCollaboration.${key}`)}</p>
      {latestReply?.createdAt && Number.isFinite(Date.parse(latestReply.createdAt)) && (
        <p className="mt-1" data-testid="inbox-conflict-latest-reply">
          {t("inboxCollaboration.latestReply", { time: new Date(latestReply.createdAt).toLocaleString(i18n.language), kind: t(`inboxCollaboration.${latestReply.generatedBy === "ai_brain" ? "aiReply" : "reply"}`) })}
        </p>
      )}
      {!["send_in_progress", "reviewed"].includes(code) && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7"
          onClick={onReview}
        >
          {t("inboxCollaboration.review")}
        </Button>
      )}
    </div>
  );
}
