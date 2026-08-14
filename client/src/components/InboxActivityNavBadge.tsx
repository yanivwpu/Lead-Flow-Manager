import { cn } from "@/lib/utils";
import { useInboxNewActivityBadge } from "@/lib/useInboxNewActivityBadge";

/** Small count badge for Inbox nav icon (sidebar / mobile). */
export function InboxActivityNavBadge({
  className,
  testId,
}: {
  className?: string;
  testId: string;
}) {
  const { label } = useInboxNewActivityBadge();
  if (!label) return null;
  return (
    <span
      data-testid={testId}
      className={cn(
        "pointer-events-none absolute -top-1 -right-1 z-10 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border border-white bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white",
        className,
      )}
      aria-label={`${label} new Inbox messages`}
    >
      {label}
    </span>
  );
}
