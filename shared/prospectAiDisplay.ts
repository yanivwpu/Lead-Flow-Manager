/**
 * Prospect AI presentation mappings — labels, page copy, activity timeline helpers.
 * Display only; does not change backend statuses or APIs.
 */

import type { AiGrowthAssistantModel } from "./prospectAiPersonality";

/** Top-level Prospect AI workspace tabs (query `?tab=` values). */
export const PROSPECT_AI_TAB_LABELS = {
  discover: "Discover",
  review: "Review",
  campaign: "Campaigns",
  inbox: "Inbox",
  activity: "Activity",
  won: "Won",
} as const;

export type ProspectAiTabId = keyof typeof PROSPECT_AI_TAB_LABELS;

/** Primary journey tabs (Activity is secondary near the page title). */
export const PROSPECT_AI_PRIMARY_TABS = [
  "discover",
  "review",
  "campaign",
  "inbox",
  "won",
] as const;

/** One short subtitle per top-level page. */
export const PROSPECT_AI_PAGE_SUBTITLES: Record<ProspectAiTabId, string> = {
  discover: "Find new businesses to grow your pipeline.",
  review: "Select prospects to enrich, then send qualified ones to Campaigns.",
  campaign: "Control outreach sending and monitor delivery.",
  inbox: "Continue conversations and move successful prospects to Won.",
  activity: "Discoveries, imports, outreach, and wins over time.",
  won: "Customers acquired through Prospect AI.",
};

/**
 * @deprecated Internal lifecycle label — prefer Ready to Send on Campaigns.
 * DB status remains `queued`.
 */
export const PROSPECT_LIFECYCLE_QUEUE_LABEL = "Campaign Queue";

/**
 * Campaigns: messages waiting to send (DB status `queued`).
 */
export const PROSPECT_READY_TO_SEND_LABEL = "Ready to Send";

/** @deprecated Use PROSPECT_READY_TO_SEND_LABEL */
export const PROSPECT_SENDING_QUEUE_LABEL = PROSPECT_READY_TO_SEND_LABEL;

/** Campaign queue item / filter display labels (keys = DB queue_status). */
export const PROSPECT_CAMPAIGN_QUEUE_STATUS_LABELS: Record<string, string> = {
  all: "All",
  queued: "Ready",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  paused: "Paused",
  skipped: "Skipped",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
};

export function prospectCampaignQueueStatusLabel(status: string | null | undefined): string {
  const key = String(status || "").toLowerCase();
  return PROSPECT_CAMPAIGN_QUEUE_STATUS_LABELS[key] || String(status || "—");
}

/** Operational metric card labels on Campaigns (not Activity). */
export const PROSPECT_CAMPAIGN_METRIC_LABELS = {
  queued: PROSPECT_READY_TO_SEND_LABEL,
  sending: "Sending",
  sentToday: "Sent today",
  outreachSent: "Outreach Sent",
  replied: "Replied",
  failed: "Failed",
  paused: "Paused",
} as const;

/** Campaigns page status filters (no dedicated Sending filter). */
export const PROSPECT_CAMPAIGN_STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "queued", label: "Ready" },
  { id: "sent", label: "Sent" },
  { id: "failed", label: "Failed" },
  { id: "paused", label: "Paused" },
];

export const PROSPECT_CAMPAIGN_CONTROL_LABELS = {
  startSending: "Start Sending",
  pauseSending: "Pause Sending",
  resumeSending: "Resume Sending",
  saveLimits: "Save limits",
} as const;

export const PROSPECT_SELECTION_LABELS = {
  selectPage: "Select page",
  selectAllResults: "Select all results",
  selectPageHint: "Select rows currently shown on this page.",
  selectAllResultsHint: "Select every prospect matching the current filters.",
} as const;

/** Activity feed event kinds derived from existing APIs (no invented types). */
export type ProspectActivityFeedKind =
  | "discovery"
  | "import"
  | "campaign"
  | "outreach"
  | "other";

export const PROSPECT_ACTIVITY_EVENT_LABELS: Record<ProspectActivityFeedKind, string> = {
  discovery: "Discovery",
  import: "Import",
  campaign: "Campaign",
  outreach: "Outreach",
  other: "Activity",
};

export type ProspectActivityFeedItem = {
  id: string;
  kind: ProspectActivityFeedKind;
  title: string;
  status?: string | null;
  at: string; // ISO
};

export type ProspectActivityDateGroup = {
  dateKey: string;
  dateLabel: string;
  items: ProspectActivityFeedItem[];
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatProspectActivityDateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const today = startOfLocalDay(now);
  const that = startOfLocalDay(d);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return that.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: that.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

export function formatProspectActivityTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Newest-first chronological feed, grouped by local calendar day. */
export function buildProspectActivityTimeline(
  items: ProspectActivityFeedItem[],
  now: Date = new Date(),
): ProspectActivityDateGroup[] {
  const sorted = [...items].sort((a, b) => {
    const ta = Date.parse(a.at) || 0;
    const tb = Date.parse(b.at) || 0;
    return tb - ta;
  });
  const groups = new Map<string, ProspectActivityFeedItem[]>();
  const order: string[] = [];
  for (const item of sorted) {
    const d = new Date(item.at);
    const key = Number.isNaN(d.getTime())
      ? "unknown"
      : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }
  return order.map((dateKey) => {
    const list = groups.get(dateKey) || [];
    const sample = list[0]?.at || now.toISOString();
    return {
      dateKey,
      dateLabel: dateKey === "unknown" ? "Unknown date" : formatProspectActivityDateLabel(sample, now),
      items: list,
    };
  });
}

function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export type ProspectCampaignAssistantInput = {
  queued?: number | null;
  sending?: number | null;
  sentToday?: number | null;
  failed?: number | null;
  paused?: number | null;
  queueRunning?: boolean | null;
  queuePaused?: boolean | null;
};

/** Compact Campaigns assistant — operational only, real counts. */
export function buildCampaignsAiAssistantModel(
  input: ProspectCampaignAssistantInput,
): AiGrowthAssistantModel {
  const queued = Math.max(0, input.queued ?? 0);
  const sending = Math.max(0, input.sending ?? 0);
  const sentToday = Math.max(0, input.sentToday ?? 0);
  const failed = Math.max(0, input.failed ?? 0);
  const paused = Math.max(0, input.paused ?? 0);
  const lines: AiGrowthAssistantModel["lines"] = [];

  if (queued > 0) {
    lines.push({
      emoji: "📬",
      text: `${pluralize(queued, "prospect is", "prospects are")} ready to send.`,
    });
  }
  if (sending > 0) {
    lines.push({
      emoji: "📤",
      text: `${pluralize(sending, "message is", "messages are")} currently sending.`,
    });
  }
  if (sentToday > 0 && lines.length < 3) {
    lines.push({
      emoji: "✅",
      text: `${sentToday} ${sentToday === 1 ? "was" : "were"} sent today.`,
    });
  }
  if (failed > 0) {
    lines.push({
      emoji: "⚠️",
      text: `${failed} failed and ${failed === 1 ? "needs" : "need"} attention.`,
    });
  } else if (lines.length > 0) {
    lines.push({ emoji: "😊", text: "No failures need attention." });
  }
  if (paused > 0 && lines.length < 3) {
    lines.push({
      emoji: "⏸️",
      text: `${pluralize(paused, "item is", "items are")} paused.`,
    });
  }
  if (!lines.length) {
    lines.push({ emoji: "😊", text: "No active outreach right now." });
  }

  let nextAction: string | null = null;
  if (failed > 0) {
    nextAction =
      failed === 1 ? "Review 1 failed message." : `Review ${failed} failed messages.`;
  } else if (input.queuePaused) nextAction = "Resume Sending.";
  else if (queued > 0 && !input.queueRunning) nextAction = "Start Sending.";
  else if (queued > 0 && input.queueRunning) nextAction = "Monitor replies in Inbox.";
  else nextAction = "Send qualified prospects from Review.";

  return {
    idle: queued === 0 && sending === 0 && failed === 0,
    title: "AI Growth Assistant",
    titleEmoji: "🧠",
    lines: lines.slice(0, 3),
    nextAction,
  };
}

/** Map raw activity API / import rows into timeline feed items (no invented events). */
export function mapProspectActivityApiToFeedItems(input: {
  events?: Array<{
    id?: string;
    type?: string | null;
    label?: string | null;
    description?: string | null;
    createdAt?: string | null;
    status?: string | null;
    channel?: string | null;
  }>;
  outreachEvents?: Array<{
    id?: string;
    type?: string | null;
    label?: string | null;
    description?: string | null;
    createdAt?: string | null;
    status?: string | null;
    channel?: string | null;
  }>;
  campaignEvents?: Array<{
    id?: string;
    type?: string | null;
    label?: string | null;
    description?: string | null;
    createdAt?: string | null;
    status?: string | null;
  }>;
  imports?: Array<{
    id: string;
    batchName?: string | null;
    status?: string | null;
    imported?: number | null;
    duplicates?: number | null;
    errors?: number | null;
    createdAt?: string | null;
  }>;
}): ProspectActivityFeedItem[] {
  const items: ProspectActivityFeedItem[] = [];
  const seen = new Set<string>();

  const push = (item: ProspectActivityFeedItem) => {
    if (!item.at || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  const kindFromType = (type: string | null | undefined): ProspectActivityFeedKind => {
    const t = String(type || "").toLowerCase();
    if (t === "discovery") return "discovery";
    if (t === "import") return "import";
    if (t === "campaign") return "campaign";
    if (t === "outreach") return "outreach";
    return "other";
  };

  const mapEvent = (
    ev: {
      id?: string;
      type?: string | null;
      label?: string | null;
      description?: string | null;
      createdAt?: string | null;
      status?: string | null;
      channel?: string | null;
    },
    fallbackKind: ProspectActivityFeedKind,
    idPrefix: string,
  ) => {
    const at = ev.createdAt;
    if (!at) return;
    const kind = kindFromType(ev.type) !== "other" ? kindFromType(ev.type) : fallbackKind;
    let title = String(ev.label || "").trim();
    if (!title && kind === "outreach") {
      const st = String(ev.status || "").toLowerCase();
      if (st === "sent") title = "Outreach email was sent";
      else if (st === "queued") title = `Message added to ${PROSPECT_SENDING_QUEUE_LABEL}`;
      else if (st === "failed") title = "Outreach send failed";
      else title = `Outreach ${ev.status || "update"}`;
    }
    if (!title && kind === "campaign") title = "Prospect enrolled in a campaign";
    if (!title) title = PROSPECT_ACTIVITY_EVENT_LABELS[kind];
    if (ev.description) title = `${title} — ${ev.description}`;
    if (ev.channel && kind === "outreach") title = `${title} (${ev.channel})`;
    push({
      id: `${idPrefix}-${ev.id || at}-${title}`,
      kind,
      title,
      status: ev.status,
      at,
    });
  };

  for (const ev of input.events ?? []) mapEvent(ev, "other", "ev");
  for (const ev of input.outreachEvents ?? []) mapEvent(ev, "outreach", "out");
  for (const ev of input.campaignEvents ?? []) mapEvent(ev, "campaign", "camp");

  for (const job of input.imports ?? []) {
    if (!job.createdAt) continue;
    const imported = job.imported ?? 0;
    const duplicates = job.duplicates ?? 0;
    const errors = job.errors ?? 0;
    const batch = job.batchName ? ` (${job.batchName})` : "";
    push({
      id: `import-${job.id}`,
      kind: "import",
      title: `Import${batch}: ${imported} imported, ${duplicates} duplicate${duplicates === 1 ? "" : "s"}, ${errors} error${errors === 1 ? "" : "s"}`,
      status: job.status,
      at: job.createdAt,
    });
  }

  return items;
}

export type ProspectActivityAssistantInput = {
  discoveriesToday?: number;
  outreachSentToday?: number;
  campaignEnrollmentsToday?: number;
  repliesTotal?: number;
  importBatches?: number;
  qualificationsToday?: number;
};

/** Compact Activity assistant — historical highlights for the current feed. */
export function buildActivityAiAssistantModel(
  input: ProspectActivityAssistantInput,
): AiGrowthAssistantModel {
  const discoveries = Math.max(0, input.discoveriesToday ?? 0);
  const sent = Math.max(0, input.outreachSentToday ?? 0);
  const enrolled = Math.max(0, input.campaignEnrollmentsToday ?? 0);
  const replies = Math.max(0, input.repliesTotal ?? 0);
  const imports = Math.max(0, input.importBatches ?? 0);
  const lines: AiGrowthAssistantModel["lines"] = [];

  if (discoveries > 0) {
    lines.push({
      emoji: "🔎",
      text: `${pluralize(discoveries, "business was", "businesses were")} discovered today.`,
    });
  }
  if (enrolled > 0) {
    lines.push({
      emoji: "📋",
      text: `${pluralize(enrolled, "prospect entered", "prospects entered")} campaigns.`,
    });
  }
  if (sent > 0) {
    lines.push({
      emoji: "✉️",
      text: `${pluralize(sent, "outreach message was", "outreach messages were")} sent today.`,
    });
  }
  if (replies > 0 && lines.length < 3) {
    lines.push({
      emoji: "💬",
      text: `${pluralize(replies, "reply was", "replies were")} received.`,
    });
  }
  if (imports > 0 && lines.length < 3) {
    lines.push({
      emoji: "📥",
      text: `${pluralize(imports, "import batch is", "import batches are")} in history.`,
    });
  }
  if (!lines.length) {
    lines.push({ emoji: "✨", text: "No Prospect AI activity recorded yet." });
  }

  return {
    idle: discoveries === 0 && sent === 0 && enrolled === 0,
    title: "AI Growth Assistant",
    titleEmoji: "🧠",
    lines: lines.slice(0, 3),
    nextAction: discoveries === 0 ? "Discover businesses to start the trail" : null,
  };
}
