import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function InboxReplyConflict({
  code,
  onReview,
}: {
  code: string | null;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  if (!code) return null;
  const key =
    code === "delivery_unknown"
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
