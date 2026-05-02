import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { SETTINGS_CHANNELS_HREF } from "@/components/ActivationSetupModal";

export interface ActivationStatusPayload {
  whatsappConnected: boolean;
  instagramConnected: boolean;
  facebookConnected: boolean;
  metaConnected: boolean;
  hasAnyMessagingChannel: boolean;
  hasSentFirstMessage: boolean;
  checklistComplete: boolean;
}

interface ActivationChecklistProps {
  /** Extra offset from top when another banner/pill row is visible */
  className?: string;
}

export function ActivationChecklist({ className }: ActivationChecklistProps) {
  const { data, isLoading } = useQuery<ActivationStatusPayload>({
    queryKey: ["/api/activation-status"],
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading || !data || data.checklistComplete) {
    return null;
  }

  const whatsappDone = data.whatsappConnected;
  const metaDone = data.metaConnected;
  const messageDone = data.hasSentFirstMessage;

  const Row = ({
    done,
    label,
    href,
  }: {
    done: boolean;
    label: string;
    href?: string;
  }) => (
    <div className="flex items-start gap-2.5 py-1.5 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-gray-300 mt-0.5" aria-hidden />
      )}
      <span className={cn(done ? "text-gray-500 line-through" : "text-gray-800")}>{label}</span>
      {!done && href && (
        <Link href={href}>
          <a className="ml-auto shrink-0 text-xs font-medium text-brand-green hover:underline">Set up</a>
        </Link>
      )}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-activation-checklist"
          className={cn(
            "pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/95 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-slate-50 hover:border-slate-300",
            className,
          )}
        >
          <ListChecks className="h-3.5 w-3.5 opacity-80" aria-hidden />
          <span>Setup</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4" data-testid="popover-activation-checklist">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Get started</p>
        <div className="divide-y divide-gray-100">
          <Row done={whatsappDone} label="Connect WhatsApp" href={SETTINGS_CHANNELS_HREF} />
          <Row done={metaDone} label="Connect Instagram or Facebook" href={SETTINGS_CHANNELS_HREF} />
          <Row done={messageDone} label="Send your first message" href="/app/inbox" />
        </div>
        {!messageDone && (
          <p className="mt-3 text-xs text-gray-500">
            Open the inbox and send a reply to a contact — or message yourself from your phone.
          </p>
        )}
        <Link href={SETTINGS_CHANNELS_HREF}>
          <a className="mt-4 block">
            <Button type="button" variant="outline" size="sm" className="w-full border-gray-200 text-xs">
              Channel settings
            </Button>
          </a>
        </Link>
      </PopoverContent>
    </Popover>
  );
}
