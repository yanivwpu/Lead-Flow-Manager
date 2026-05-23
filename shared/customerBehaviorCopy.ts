/**
 * App-wide UX: AI explains what it sees, not how it calculated it.
 * Use for Inbox, Copilot, Recent Activity, Growth Engines, and AI Brain — not Admin/debug.
 */

export const FINANCING_GUIDANCE_SUGGESTION =
  "Ask if they're already working with a lender or need a recommendation.";

/** Strip internal developer labels from user-visible text. */
export const TECHNICAL_USER_FACING_RE =
  /\b(RGE|W3|schedule_showing|create_task|workflow seed|template key|WORKING_WITH_LENDER|BOOKING_INTENT|ENGAGEMENT_BACK_AND_FORTH|engagement:|interest:|decision:|combo:|NEEDS_FINANCING|FINANCING_DISCUSSION|PREAPPROVED_YES|SHOWING_REQUEST|SPECIFIC_DATE_INTENT|REPEAT_ENGAGEMENT|Growth Engine \w+ booking prompt)\b/i;

export function sanitizeUserFacingText(text: string): string {
  if (!text?.trim()) return "";
  if (TECHNICAL_USER_FACING_RE.test(text)) return "";
  return text.trim();
}

export function parseSignalList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function hasShowingInterestFromSignals(signals: unknown): boolean {
  return parseSignalList(signals).some((s) =>
    ["SHOWING_REQUEST", "BOOKING_INTENT", "SPECIFIC_DATE_INTENT"].includes(s),
  );
}

export function hasFinancingDiscussionFromSignals(signals: unknown): boolean {
  return parseSignalList(signals).some((s) =>
    ["FINANCING_DISCUSSION", "NEEDS_FINANCING"].includes(s),
  );
}

export function hasExplicitFinancingFromSignals(signals: unknown): boolean {
  return parseSignalList(signals).some((s) =>
    ["WORKING_WITH_LENDER", "PREAPPROVED_YES", "CASH_BUYER"].includes(s),
  );
}

export function bucketLabel(bucket: string): string {
  if (bucket === "hot") return "Hot";
  if (bucket === "warm") return "Warm";
  if (bucket === "cold") return "Cold";
  return "Unqualified";
}

export function formatScoreActivityEvent(data: {
  previousScore?: number | null;
  newScore?: number | null;
  bucketBefore?: string;
  bucketAfter?: string;
  signals?: unknown;
  content?: string;
  title?: string;
}): { title: string; detail: string } {
  const hay = `${data.title ?? ""} ${data.content ?? ""}`.toLowerCase();
  const showing =
    hasShowingInterestFromSignals(data.signals) ||
    /showing|appointment/.test(hay);
  const financing = hasFinancingDiscussionFromSignals(data.signals);
  const engaged = parseSignalList(data.signals).includes("REPEAT_ENGAGEMENT");
  const prev = data.previousScore;
  const next = data.newScore;
  const bucketBefore = data.bucketBefore ?? "";
  const bucketAfter = data.bucketAfter ?? "";

  if (bucketBefore && bucketAfter && bucketBefore !== bucketAfter) {
    if (showing) {
      return {
        title: "Customer requested a showing",
        detail: "",
      };
    }
    if (bucketAfter === "hot" || bucketAfter === "warm") {
      return {
        title: "Customer showed strong interest",
        detail: "",
      };
    }
    return { title: "Customer engagement changed", detail: "" };
  }

  if (showing && prev != null && next != null && next > prev) {
    return {
      title: "Customer requested a showing",
      detail: "",
    };
  }

  if (financing) {
    return {
      title: "Customer asked about financing",
      detail: "",
    };
  }

  if (engaged) {
    return { title: "Customer is actively engaging", detail: "" };
  }

  if (prev != null && next != null && next > prev) {
    return { title: "Customer showed stronger interest", detail: "" };
  }

  return { title: "Customer engagement updated", detail: "" };
}

const SCORING_REASON_MAP: Record<string, string> = {
  "Customer ready to proceed": "Customer appears ready to move forward",
  "Strong buying intent detected": "Customer appears ready to move forward",
  "Combined pricing and buying signals": "Customer asked about pricing and buying",
  "Strong engagement from customer": "Customer is highly engaged",
  "Some engagement from customer": "Customer is engaged",
  "Interest / discovery signals": "Customer is exploring options",
  "Strong decision / next-step intent": "Customer appears ready to move forward",
  "Time-sensitive / urgent": "Customer seems time-sensitive",
  "Real-estate-specific signals": "Customer shared property-related details",
  "Property-management signals": "Customer shared rental-related details",
};

export function humanizeScoringReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return null;
  if (/configured qualification field|Primary score from your CRM|Conversation signals|scoring signal|CRM score|conversation estimate/i.test(trimmed)) {
    return null;
  }
  if (SCORING_REASON_MAP[trimmed]) return SCORING_REASON_MAP[trimmed];
  if (TECHNICAL_USER_FACING_RE.test(trimmed)) return null;
  if (/^\d+ configured qualification fields not yet captured$/i.test(trimmed)) {
    return "A few details are still missing";
  }
  if (/missingRequired|signal:/i.test(trimmed)) return null;
  return trimmed;
}

export function humanizeScoringReasons(reasons: string[]): string[] {
  const out: string[] = [];
  for (const reason of reasons) {
    const human = humanizeScoringReason(reason);
    if (human && !out.includes(human)) out.push(human);
  }
  return out.slice(0, 6);
}
