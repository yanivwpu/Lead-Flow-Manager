import { format } from "date-fns";
import { Calendar } from "lucide-react";

export type CalendlyEventMessage = {
  type?: string;
  kind?: "booked" | "canceled" | "rescheduled" | "no_show";
  title?: string;
  eventName?: string;
  startTime?: string | null;
  endTime?: string | null;
  previousStartTime?: string | null;
  timeLabel?: string;
  cardTimeLabel?: string;
  previousTimeLabel?: string;
  meetingLink?: string | null;
  isRescheduleCancellation?: boolean;
};

export type CalendlyMessageLike = {
  contentType?: string;
  content?: string | null;
};

const CHIP_MAX = "max-w-[min(320px,88vw)]";

export function parseCalendlyEventMessage(msg: CalendlyMessageLike): CalendlyEventMessage | null {
  if (msg.contentType !== "calendly_event") return null;
  try {
    const parsed = JSON.parse(msg.content || "{}") as CalendlyEventMessage;
    return parsed?.type === "calendly_booking" ? parsed : null;
  } catch {
    return null;
  }
}

/** Index of the single expanded card: latest active booking (booked/rescheduled), unless canceled afterward. */
export function findExpandedCalendlyMessageIndex(messages: CalendlyMessageLike[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const ev = parseCalendlyEventMessage(messages[i]);
    if (!ev) continue;
    if (ev.kind === "booked" || ev.kind === "rescheduled") return i;
    if (ev.kind === "canceled") return null;
  }
  return null;
}

function formatChipTime(iso?: string | null, fallback?: string): string {
  if (iso) {
    try {
      return format(new Date(iso), "MMM d, h:mm a");
    } catch {
      // fall through
    }
  }
  if (fallback) {
    try {
      return format(new Date(fallback), "MMM d, h:mm a");
    } catch {
      return fallback;
    }
  }
  return "Time TBD";
}

function formatEventTime(event: CalendlyEventMessage): string {
  if (event.startTime) {
    try {
      return format(new Date(event.startTime), "MMM d, h:mm a");
    } catch {
      // fall through
    }
  }
  if (event.timeLabel) return event.timeLabel;
  return event.cardTimeLabel || "Time TBD";
}

function formatDurationMinutes(event: CalendlyEventMessage): string | null {
  if (event.startTime && event.endTime) {
    const mins = Math.round(
      (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60_000,
    );
    if (mins > 0) return `${mins} min`;
  }
  const fromName = event.eventName?.match(/(\d+)\s*[- ]?\s*minute/i);
  if (fromName) return `${fromName[1]} min`;
  return null;
}

function expandedHeadline(event: CalendlyEventMessage): string {
  if (event.kind === "rescheduled") return "Meeting booked";
  if (event.kind === "booked") return "Meeting booked";
  return event.title || "Calendly activity";
}

function compactHeadline(event: CalendlyEventMessage): string {
  const time = formatEventTime(event);

  if (event.kind === "rescheduled" || event.isRescheduleCancellation) {
    const prev =
      event.previousTimeLabel ||
      (event.previousStartTime ? formatChipTime(event.previousStartTime) : null);
    if (prev) return `Meeting rescheduled · ${prev} → ${time}`;
    return `Meeting rescheduled · ${time}`;
  }
  if (event.kind === "canceled") return `Meeting canceled · ${time}`;
  if (event.kind === "no_show") return `No-show · ${time}`;
  if (event.kind === "booked") return `Previous appointment booking · ${time}`;
  return `Calendly activity · ${time}`;
}

type CalendlyAppointmentChipProps = {
  event: CalendlyEventMessage;
  expanded: boolean;
};

export function CalendlyAppointmentChip({ event, expanded }: CalendlyAppointmentChipProps) {
  const time = formatEventTime(event);
  const duration = formatDurationMinutes(event);
  const metaLine = duration ? `${time} · ${duration}` : time;

  if (!expanded) {
    return (
      <div className="flex min-w-0 justify-center px-1 py-px animate-msg-in">
        <div
          className={`inline-flex w-fit ${CHIP_MAX} min-w-0 items-center gap-1 rounded-md border border-gray-200/70 bg-white/80 px-1.5 py-0.5 text-[10px] leading-snug text-gray-500`}
          title={event.eventName || undefined}
        >
          <Calendar className="h-2.5 w-2.5 shrink-0 text-gray-400" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere] break-words">{compactHeadline(event)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 justify-center px-1 py-px animate-msg-in">
      <div
        className={`inline-flex w-fit ${CHIP_MAX} min-w-0 flex-col rounded-md border border-emerald-100/90 bg-white/85 px-1.5 py-1`}
        title={event.eventName || undefined}
      >
        <div className="flex items-center gap-1">
          <Calendar className="h-2.5 w-2.5 shrink-0 text-emerald-600" aria-hidden />
          <span className="text-[11px] font-medium leading-tight text-gray-800">{expandedHeadline(event)}</span>
        </div>
        <p className="pl-[calc(0.625rem+0.25rem)] text-[10px] leading-tight text-gray-500">{metaLine}</p>
      </div>
    </div>
  );
}
