/**
 * Unified lead qualification thresholds for Copilot scoring, inbox tags, and insights.
 * Keep Hot Lead / Warm Lead / Unqualified aligned across AI Brain and system auto-tagging.
 */

export type LeadBucket = "hot" | "warm" | "cold" | "unqualified";

/** Inbox Hot Lead tag is never applied below this score (matches product rule). */
export const MIN_HOT_TAG_SCORE = 25;

export const BUCKET_THRESHOLDS = {
  hot: 75,
  warm: 45,
  cold: 15,
} as const;

export function bucketFromNumericScore(score: number): LeadBucket {
  if (score >= BUCKET_THRESHOLDS.hot) return "hot";
  if (score >= BUCKET_THRESHOLDS.warm) return "warm";
  if (score >= BUCKET_THRESHOLDS.cold) return "cold";
  return "unqualified";
}

export function qualifiesForHotTag(bucket: LeadBucket, score: number): boolean {
  return bucket === "hot" && score >= MIN_HOT_TAG_SCORE;
}

export function qualifiesForWarmTag(bucket: LeadBucket, score: number): boolean {
  return bucket === "warm" && score >= MIN_HOT_TAG_SCORE;
}

/** System auto-tag from bucket + score (null = leave tag unchanged / no positive tag). */
export function systemTagForQualification(
  bucket: LeadBucket,
  score: number,
): "Hot Lead" | "Warm Lead" | "Unqualified" | null {
  if (bucket === "unqualified" || score < MIN_HOT_TAG_SCORE) {
    return "Unqualified";
  }
  if (qualifiesForHotTag(bucket, score)) return "Hot Lead";
  if (qualifiesForWarmTag(bucket, score)) return "Warm Lead";
  return null;
}

/** Downgrades (unqualified / sub-threshold) bypass confidence gates on the server. */
export function isQualificationDowngrade(
  desiredTag: "Hot Lead" | "Warm Lead" | "Unqualified" | null,
  currentTag: string | null | undefined,
): boolean {
  if (desiredTag !== "Unqualified") return false;
  const cur = (currentTag || "").trim();
  return cur === "Hot Lead" || cur === "Warm Lead";
}

export type ConversationActivityStats = {
  inbound: number;
  outbound: number;
  turns: number;
};

const MEDIA_PLACEHOLDER_RE =
  /^(?:photo|video|audio|document|media|attachment|image|file|pdf|sticker|gif)(?:\s+shared)?$/i;

export function isMediaPlaceholderContent(raw: string): boolean {
  const t = (raw || "").trim();
  if (!t) return true;
  return MEDIA_PLACEHOLDER_RE.test(t);
}

export function hasSubstantiveInboundText(inboundJoined: string): boolean {
  const t = (inboundJoined || "").trim();
  if (t.length < 8) return false;
  if (MEDIA_PLACEHOLDER_RE.test(t)) return false;
  return true;
}

/** Genuine back-and-forth — not a single unsolicited attachment or media ping. */
export function hasGenuineConversationActivity(
  stats: ConversationActivityStats,
  inboundJoined: string,
): boolean {
  if (stats.inbound >= 2 && hasSubstantiveInboundText(inboundJoined)) return true;
  if (stats.turns >= 2 && hasSubstantiveInboundText(inboundJoined)) return true;
  return false;
}

export function isInboundMediaOnlyMessages(
  messages: Array<{ direction: string; content: string }>,
): boolean {
  const inbound = messages.filter((m) => m.direction === "inbound");
  if (inbound.length === 0) return false;
  return inbound.every((m) => isMediaPlaceholderContent(m.content));
}

export function buildTagDiagnostics(input: {
  score: number;
  bucket: LeadBucket;
  confidence: number;
  reasons: string[];
  stats: ConversationActivityStats;
  mediaOnly: boolean;
  inboundJoined?: string;
  scoreSource?: "crm" | "conversation";
}): string[] {
  const lines: string[] = [];
  lines.push(`score=${input.score} bucket=${input.bucket} confidence=${input.confidence.toFixed(2)}`);
  if (input.scoreSource) lines.push(`scoreSource=${input.scoreSource}`);
  lines.push(
    `activity inbound=${input.stats.inbound} outbound=${input.stats.outbound} turns=${input.stats.turns}`,
  );
  if (input.mediaOnly) lines.push("mediaOnly=true");
  if (!hasGenuineConversationActivity(input.stats, input.inboundJoined ?? "")) {
    lines.push("genuineConversation=false");
  }
  if (input.score < MIN_HOT_TAG_SCORE) {
    lines.push(`hotTagBlocked=score_below_${MIN_HOT_TAG_SCORE}`);
  }
  const tag = systemTagForQualification(input.bucket, input.score);
  lines.push(`systemTag=${tag ?? "none"}`);
  if (input.reasons.length > 0) {
    lines.push(`reasons=${input.reasons.slice(0, 4).join(" | ")}`);
  }
  return lines;
}
