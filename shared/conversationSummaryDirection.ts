/**
 * Direction-aware conversation summary helpers.
 * Outbound Agent/sales copy must never be attributed as prospect intent.
 */

export type DirectionalMessage = {
  direction: "inbound" | "outbound" | string;
  content?: string | null;
};

export function countMessageDirections(messages: DirectionalMessage[]): {
  inbound: number;
  outbound: number;
} {
  let inbound = 0;
  let outbound = 0;
  for (const m of messages || []) {
    const d = String(m.direction || "").toLowerCase();
    if (d === "inbound") inbound += 1;
    else if (d === "outbound") outbound += 1;
  }
  return { inbound, outbound };
}

/**
 * Neutral product topic from OUR outbound copy — never phrased as prospect intent.
 */
export function extractNeutralOutreachTopic(outboundText: string): string | null {
  const text = String(outboundText || "");
  if (!text.trim()) return null;
  if (/whachat/i.test(text)) {
    return "WhachatCRM's unified messaging and CRM capabilities";
  }
  if (/whatsapp.*instagram|unified inbox|one inbox/i.test(text)) {
    return "unified messaging and inbox capabilities";
  }
  return null;
}

export function buildOutboundOnlyConversationSummary(opts?: {
  productHint?: string | null;
}): string {
  const hint = String(opts?.productHint || "").trim();
  if (hint) {
    return `Initial outreach sent about ${hint}. Awaiting a response.`;
  }
  return "Initial outreach sent. Awaiting a response.";
}

/** True when only our messages exist — no prospect reply to summarize intent from. */
export function isOutboundOnlyConversation(messages: DirectionalMessage[]): boolean {
  const { inbound, outbound } = countMessageDirections(messages);
  return outbound > 0 && inbound === 0;
}

/**
 * Guardrails for AI / rule summaries — reject copy that attributes outbound pitch
 * features as prospect interest when no inbound reply exists.
 */
export function summaryFabricatesProspectIntent(summary: string): boolean {
  const s = String(summary || "").toLowerCase();
  if (!s.trim()) return false;
  return (
    /\b(is exploring|is interested|is looking for|wants to|looking to buy|looking for a platform|interested in a platform|exploring options)\b/.test(
      s,
    ) || /\b(the (prospect|lead|customer|contact) (is|wants|needs|looking))\b/.test(s)
  );
}
