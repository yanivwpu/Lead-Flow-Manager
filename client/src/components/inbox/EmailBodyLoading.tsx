import { cn } from "@/lib/utils";

/** Shared by the details request and the frame's first measurement. */
export function EmailBodyLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex h-24 w-full items-center text-xs text-muted-foreground", className)}
      role="status"
      data-testid="email-body-loading"
    >
      Loading email…
    </div>
  );
}
