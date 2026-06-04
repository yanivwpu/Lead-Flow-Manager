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
  const bookingUrl =
    typeof event.meetingLink === "string" && /^https?:\/\//i.test(event.meetingLink)
      ? event.meetingLink
      : "";
  const time = formatEventTime(event);
  const duration = formatDurationMinutes(event);
  const metaLine = duration ? `${time} · ${duration}` : time;

  if (!expanded) {
    return (
      <div className="flex min-w-0 justify-center px-1 py-0.5 animate-msg-in">
        <div
          className="inline-flex max-w-[420px] min-w-0 items-center gap-1.5 rounded-md border border-gray-200/90 bg-white/90 px-2 py-1 text-[11px] leading-snug text-gray-600 shadow-sm"
          title={event.eventName || undefined}
        >
          <Calendar className="h-3 w-3 shrink-0 text-gray-400" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere] break-words">{compactHeadline(event)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 justify-center px-1 py-0.5 animate-msg-in">
      <div className="w-full min-w-0 max-w-[420px] rounded-lg border border-emerald-200/80 bg-white/95 px-2.5 py-1.5 text-xs shadow-sm">
        <div className="flex min-w-0 items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          <span className="font-semibold text-gray-900">{expandedHeadline(event)}</span>
        </div>
        <p className="mt-0.5 pl-5 text-[11px] text-gray-600">{metaLine}</p>
        {bookingUrl ? (
          <button
            type="button"
            onClick={() => window.open(bookingUrl, "_blank", "noopener,noreferrer")}
            className="mt-0.5 pl-5 text-left text-[11px] font-medium text-emerald-700 underline-offset-2 hover:underline"
          >
            View appointment
          </button>
        ) : null}
      </div>
    </div>
  );
}
