import type { WebchatPageContext } from "@shared/webchatPageContext";
import { eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { agentNeighborhoodPilot } from "@shared/schema";
import { buildAgentPageUrl } from "@shared/agent/agentPageSlug";
import {
  VICTORIA_PARK_AGENT_SLUG, VICTORIA_PARK_DRAFT, VICTORIA_PARK_SLUG,
  VICTORIA_PARK_TITLE, victoriaParkContentComplete,
} from "@shared/agent/victoriaPark";
import { getAppOrigin } from "../urlOrigins";
import { resolveAgentPageBySlug } from "./agentPageDb";

export function isVictoriaParkPilotOwner(userId: string): boolean {
  return Boolean(userId && process.env.RGE_VICTORIA_PARK_PILOT_USER_ID?.trim() === userId);
}

export function victoriaParkUrl(appOrigin = getAppOrigin()): string {
  return `${buildAgentPageUrl(VICTORIA_PARK_AGENT_SLUG, appOrigin)}/${VICTORIA_PARK_SLUG}`;
}

export async function readVictoriaParkDraft(userId: string) {
  const [row] = await db.select().from(agentNeighborhoodPilot)
    .where(eq(agentNeighborhoodPilot.userId, userId)).limit(1);
  return row ?? { userId, content: VICTORIA_PARK_DRAFT, published: false };
}

export async function saveVictoriaParkDraft(userId: string, content: string, published: boolean) {
  await db.insert(agentNeighborhoodPilot).values({ userId, content, published })
    .onConflictDoUpdate({ target: agentNeighborhoodPilot.userId, set: { content, published } });
}

/** Call only after resolving the eligible parent Agent Page. */
export async function publishedVictoriaPark(agent: { userId: string; agentPageSlug: string | null }) {
  if (!isVictoriaParkPilotOwner(agent.userId) || agent.agentPageSlug !== VICTORIA_PARK_AGENT_SLUG) return;
  try {
    const draft = await readVictoriaParkDraft(agent.userId);
    if (draft.published && victoriaParkContentComplete(draft.content)) return draft;
  } catch (error) {
    // Pilot storage should never block the existing Agent Page or widget.
    console.error("[agent-neighborhood] publication lookup failed", error);
  }
}

export async function verifiedVictoriaParkChatContext(userId: string, parentUrl?: string | null): Promise<WebchatPageContext | undefined> {
  if (!isVictoriaParkPilotOwner(userId) || !parentUrl) return;
  let url: URL;
  try { url = new URL(parentUrl); } catch { return; }
  if (`${url.origin}${url.pathname}` !== victoriaParkUrl() || url.searchParams.has("embed")) return;
  const agent = await resolveAgentPageBySlug(VICTORIA_PARK_AGENT_SLUG);
  if (agent?.userId === userId && await publishedVictoriaPark(agent)) {
    return { latestUrl: victoriaParkUrl(), pageTitle: VICTORIA_PARK_TITLE, agentNeighborhood: VICTORIA_PARK_SLUG };
  }
}
