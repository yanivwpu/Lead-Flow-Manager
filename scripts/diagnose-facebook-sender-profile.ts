/**
 * Diagnose Facebook Messenger PSID profile lookup for Affordable Pompano.
 * Never prints raw tokens.
 *
 * Usage:
 *   npx tsx scripts/diagnose-facebook-sender-profile.ts [psid] [pageId]
 */
import "dotenv/config";
import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { channelSettings, contacts } from "@shared/schema";
import { sanitizeMetaError } from "../server/metaFacebookReconnectDiag";

const DEFAULT_PSIDS = ["27842272592092598", "28646732624931607"];
const DEFAULT_PAGE_ID = "1257286427457815";
const GRAPH_VERSION = "v19.0";

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

async function graphGet(pathAndQuery: string, token: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}${pathAndQuery}${
    pathAndQuery.includes("?") ? "&" : "?"
  }access_token=${encodeURIComponent(token)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: resp.status, json, metaError: sanitizeMetaError(resp.status, json) };
}

async function main() {
  const psidArg = process.argv[2];
  const pageId = process.argv[3] || DEFAULT_PAGE_ID;
  const psids = psidArg ? [psidArg] : DEFAULT_PSIDS;

  console.log("[diagnose-fb-profile] start", { pageId, psids, graphVersion: GRAPH_VERSION });

  const rows = await db
    .select()
    .from(channelSettings)
    .where(and(eq(channelSettings.channel, "facebook"), eq(channelSettings.isConnected, true)));

  const match = rows.find((r) => {
    const cfg = (r.config || {}) as Record<string, unknown>;
    return String(cfg.pageId || "") === pageId;
  });

  if (!match) {
    console.log("[diagnose-fb-profile] NO connected facebook channel_settings for pageId", pageId);
    console.log(
      "[diagnose-fb-profile] connected facebook pages:",
      rows.map((r) => {
        const cfg = (r.config || {}) as Record<string, unknown>;
        return {
          userId: r.userId,
          pageId: cfg.pageId ?? null,
          pageName: cfg.pageName ?? null,
          tokenPresent: Boolean(cfg.accessToken),
        };
      }),
    );
    process.exit(2);
  }

  const cfg = (match.config || {}) as Record<string, unknown>;
  const token = typeof cfg.accessToken === "string" ? cfg.accessToken : "";
  console.log("[diagnose-fb-profile] matched channel_settings", {
    userId: match.userId,
    pageId: cfg.pageId ?? null,
    pageName: cfg.pageName ?? null,
    tokenPresent: Boolean(token),
    tokenFingerprint: token ? tokenFingerprint(token) : null,
  });

  for (const psid of psids) {
    const [contact] = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        avatar: contacts.avatar,
        avatarFetchedAt: contacts.avatarFetchedAt,
        facebookId: contacts.facebookId,
        sourceDetails: contacts.sourceDetails,
        userId: contacts.userId,
        updatedAt: contacts.updatedAt,
      })
      .from(contacts)
      .where(and(eq(contacts.facebookId, psid), eq(contacts.userId, match.userId)))
      .limit(1);

    console.log("[diagnose-fb-profile] contact_row", {
      psid,
      found: Boolean(contact),
      contactId: contact?.id ?? null,
      name: contact?.name ?? null,
      avatarPresent: Boolean(contact?.avatar),
      avatarFetchedAt: contact?.avatarFetchedAt ?? null,
      facebookDisplayNameSource:
        contact?.sourceDetails && typeof contact.sourceDetails === "object"
          ? (contact.sourceDetails as any).facebookDisplayNameSource ?? null
          : null,
      userId: contact?.userId ?? null,
      updatedAt: contact?.updatedAt ?? null,
    });

    if (!token) continue;

    const userProfileFields = "name,first_name,last_name,profile_pic";
    const userProfile = await graphGet(
      `/${encodeURIComponent(psid)}?fields=${encodeURIComponent(userProfileFields)}`,
      token,
    );
    console.log("[diagnose-fb-profile] user_profile_api", {
      psid,
      endpoint: `GET /${GRAPH_VERSION}/{psid}?fields=${userProfileFields}`,
      httpStatus: userProfile.status,
      responseHasName: typeof userProfile.json.name === "string",
      responseHasFirstName: typeof userProfile.json.first_name === "string",
      responseHasLastName: typeof userProfile.json.last_name === "string",
      responseHasProfilePic: typeof userProfile.json.profile_pic === "string",
      responseId: userProfile.json.id ?? null,
      metaError: userProfile.metaError,
      keys: Object.keys(userProfile.json || {}),
    });

    // Fallback documented by community: message object `from.name` via recent mid if available
    const midRows = await db.execute(sql`
      SELECT m.external_message_id AS mid
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ${match.userId}
        AND c.channel = 'facebook'
        AND m.direction = 'inbound'
        AND m.external_message_id IS NOT NULL
        AND (
          c.contact_id = ${contact?.id ?? "00000000-0000-0000-0000-000000000000"}
          OR m.content ILIKE ${"%" + psid + "%"}
        )
      ORDER BY m.created_at DESC
      LIMIT 3
    `);
    const mids = (midRows.rows || midRows || []) as Array<{ mid?: string }>;
    const midList = Array.isArray(mids)
      ? mids.map((r: any) => r.mid || r.external_message_id).filter(Boolean)
      : [];

    for (const mid of midList.slice(0, 2)) {
      const msgProfile = await graphGet(
        `/${encodeURIComponent(String(mid))}?fields=${encodeURIComponent("from,message")}`,
        token,
      );
      const from = (msgProfile.json as any)?.from;
      console.log("[diagnose-fb-profile] message_from_api", {
        psid,
        mid: String(mid).slice(0, 40),
        endpoint: `GET /${GRAPH_VERSION}/{mid}?fields=from,message`,
        httpStatus: msgProfile.status,
        fromName: typeof from?.name === "string" ? from.name : null,
        fromId: from?.id != null ? String(from.id) : null,
        metaError: msgProfile.metaError,
        keys: Object.keys(msgProfile.json || {}),
      });
    }

    // Page self-check with same token
    const pageProbe = await graphGet(
      `/${encodeURIComponent(pageId)}?fields=${encodeURIComponent("id,name")}`,
      token,
    );
    console.log("[diagnose-fb-profile] page_probe", {
      pageId,
      httpStatus: pageProbe.status,
      returnedId: pageProbe.json.id ?? null,
      returnedName: pageProbe.json.name ?? null,
      metaError: pageProbe.metaError,
    });
  }

  console.log("[diagnose-fb-profile] done");
}

main().catch((e) => {
  console.error("[diagnose-fb-profile] FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});
