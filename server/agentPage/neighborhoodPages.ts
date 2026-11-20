import { createHash } from "node:crypto";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { agentNeighborhoodPages as pages } from "@shared/schema";
import { slugifyListingText } from "@shared/inventory/listingPublicSlug";
import { buildNeighborhoodUrl, neighborhoodContentComplete, neighborhoodTitle, type NeighborhoodContent } from "@shared/agent/neighborhoodPages";
import { canResolvePublicAgentPage } from "@shared/agent/publicAgentPage";
import type { WebchatPageContext } from "@shared/webchatPageContext";
import { getAppOrigin } from "../urlOrigins";
import { getAgentPageSettingsRow, resolveAgentPageBySlug } from "./agentPageDb";
import { hasAgentPagePublicationAccess } from "./agentPagePublication";

export type NeighborhoodPage = typeof pages.$inferSelect;

function neighborhoodSlug(name: string): string {
  return slugifyListingText(name).slice(0, 80).replace(/-+$/, "") ||
    `neighborhood-${createHash("sha256").update(name.normalize("NFKC").toLowerCase()).digest("hex").slice(0, 16)}`;
}

function ownedPage(userId: string, id: string) {
  return and(eq(pages.userId, userId), eq(pages.id, id));
}

export function listNeighborhoodPages(userId: string) {
  return db.select().from(pages).where(eq(pages.userId, userId)).orderBy(asc(pages.name), asc(pages.id));
}

export async function getNeighborhoodPage(userId: string, id: string) {
  const [page] = await db.select().from(pages).where(ownedPage(userId, id)).limit(1);
  return page;
}

export async function createNeighborhoodPage(userId: string, content: NeighborhoodContent) {
  const [page] = await db.insert(pages).values({ ...content, userId, slug: neighborhoodSlug(content.name) }).returning();
  return page;
}

function ownedPageVersion(userId: string, id: string, expectedUpdatedAt?: string) {
  return and(ownedPage(userId, id), expectedUpdatedAt === undefined ? undefined
    : sql`date_trunc('milliseconds', ${pages.updatedAt}) = ${expectedUpdatedAt}::timestamptz`);
}

export async function updateNeighborhoodPage(userId: string, id: string, content: NeighborhoodContent & { published: boolean }, expectedUpdatedAt?: string) {
  const [page] = await db.update(pages).set({
    ...content,
    slug: neighborhoodSlug(content.name),
    // Keep versions distinct even if two writes occur within one millisecond.
    updatedAt: sql`greatest(now(), date_trunc('milliseconds', ${pages.updatedAt}) + interval '1 millisecond')`,
  }).where(ownedPageVersion(userId, id, expectedUpdatedAt)).returning();
  return page;
}

export async function deleteNeighborhoodPage(userId: string, id: string, expectedUpdatedAt?: string) {
  const [page] = await db.delete(pages).where(ownedPageVersion(userId, id, expectedUpdatedAt)).returning({ id: pages.id });
  return Boolean(page);
}

export function isPublishedNeighborhood(page: NeighborhoodPage): boolean {
  return page.published && neighborhoodContentComplete(page.content);
}

/** Used only after resolving the eligible public parent. */
export async function publishedNeighborhoods(userId: string, slug?: string) {
  try {
    const rows = await db.select().from(pages)
      .where(and(eq(pages.userId, userId), eq(pages.published, true), slug === undefined ? undefined : eq(pages.slug, slug)))
      .orderBy(asc(pages.name), asc(pages.id));
    return rows.filter(isPublishedNeighborhood);
  } catch (error) {
    // A neighborhood lookup failure should neither publish a page nor block its parent.
    console.error("[agent-neighborhoods] publication lookup failed", error);
    return [];
  }
}

export async function countNeighborhoodSitemapCandidates(): Promise<number> {
  const [row] = await db.select({ count: count() }).from(pages).where(eq(pages.published, true));
  return row?.count ?? 0;
}

export async function fetchNeighborhoodSitemapPaths(offset: number, limit: number): Promise<string[]> {
  const rows = await db.select().from(pages).where(eq(pages.published, true))
    .orderBy(asc(pages.id)).offset(offset).limit(limit);
  const owners = new Map<string, Promise<string | null>>();
  const paths: string[] = [];
  for (let i = 0; i < rows.length; i += 8) {
    const batch = await Promise.all(rows.slice(i, i + 8).map(async (page) => {
      if (!isPublishedNeighborhood(page)) return null;
      let owner = owners.get(page.userId);
      if (!owner) {
        owner = (async () => {
          const agent = await getAgentPageSettingsRow(page.userId);
          return agent && canResolvePublicAgentPage(agent) && await hasAgentPagePublicationAccess(page.userId)
            ? agent.agentPageSlug : null;
        })();
        owners.set(page.userId, owner);
      }
      const agentSlug = await owner;
      return agentSlug ? `${agentSlug}/${page.slug}` : null;
    }));
    for (const path of batch) if (path) paths.push(path);
  }
  return paths;
}

export function neighborhoodLeadContext(agentSlug: string, page: NeighborhoodPage): WebchatPageContext {
  return {
    latestUrl: buildNeighborhoodUrl(agentSlug, page.slug, getAppOrigin()),
    pageTitle: neighborhoodTitle(page),
    agentNeighborhood: page.slug,
    agentNeighborhoodName: page.name,
  };
}

export async function verifiedNeighborhoodChatContext(userId: string, parentUrl?: string | null): Promise<WebchatPageContext | undefined> {
  if (!parentUrl) return;
  let url: URL;
  try { url = new URL(parentUrl); } catch { return; }
  if (url.origin !== getAppOrigin() || url.searchParams.has("embed")) return;
  const parts = /^\/agents\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/.exec(url.pathname);
  if (!parts) return;
  const agent = await resolveAgentPageBySlug(parts[1]);
  if (!agent?.agentPageSlug || agent.userId !== userId) return;
  const [page] = await publishedNeighborhoods(userId, parts[2]);
  if (page) return neighborhoodLeadContext(agent.agentPageSlug, page);
}
