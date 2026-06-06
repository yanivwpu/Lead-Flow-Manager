import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type WhatsAppReadinessChecklist = {
  wabaSaved: boolean;
  phoneSaved: boolean;
  phoneStatusReady: boolean;
  webhookSubscribed: boolean;
  inboxReady: boolean;
};

const STEPS: Array<{ key: keyof WhatsAppReadinessChecklist; label: string }> = [
  { key: "wabaSaved", label: "WhatsApp Business Account saved" },
  { key: "phoneSaved", label: "Phone number saved" },
  { key: "phoneStatusReady", label: "Phone status ready in Meta" },
  { key: "webhookSubscribed", label: "Webhook subscribed" },
  { key: "inboxReady", label: "Inbox ready to send & receive" },
];

export function WhatsAppConnectionHealthChecklist({
  readiness,
  fullyReady,
  loading,
  className,
}: {
  readiness: WhatsAppReadinessChecklist | null | undefined;
  fullyReady: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 space-y-2",
        fullyReady ? "border-emerald-200 bg-emerald-50/80" : "border-amber-200 bg-amber-50/70",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-700 shrink-0" />
        ) : fullyReady ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-amber-700 shrink-0" />
        )}
        <p className={cn("text-sm font-semibold", fullyReady ? "text-emerald-900" : "text-amber-900")}>
          {loading ? "Checking connection…" : fullyReady ? "WhatsApp is ready" : "Setup incomplete"}
        </p>
      </div>
      {!fullyReady && (
        <p className="text-xs text-amber-900/90 pl-6">
          Your Meta login succeeded, but messaging is not fully active yet. Complete the steps below.
        </p>
      )}
      <ul className="space-y-1.5 pl-1">
        {STEPS.map(({ key, label }) => {
          const done = !!readiness?.[key];
          return (
            <li key={key} className="flex items-start gap-2 text-xs">
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <span className={done ? "text-gray-700" : "text-amber-900 font-medium"}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
