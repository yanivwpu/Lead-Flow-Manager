/**
 * One-shot repair: for PSID-named Facebook contacts on a Page, resolve names via
 * GET /{mid}?fields=from (and User Profile API when available).
 *
 * Usage:
 *   npx tsx scripts/repair-facebook-psid-names.ts [pageId]
 */
import "dotenv/config";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { channelSettings, contacts, conversations, messages } from "@shared/schema";
import { fetchFacebookSenderProfile } from "../server/facebookSenderProfile";
import {
  buildFacebookContactNamePatch,
  mergeFacebookDisplayNameSource,
} from "../shared/facebookContactNaming";
import { storage } from "../server/storage";

const DEFAULT_PAGE_ID = "1257286427457815";

async function main() {
  const pageId = process.argv[2] || DEFAULT_PAGE_ID;
  const rows = await db
    .select()
    .from(channelSettings)
    .where(and(eq(channelSettings.channel, "facebook"), eq(channelSettings.isConnected, true)));
  const match = rows.find((r) => String((r.config as any)?.pageId || "") === pageId);
  if (!match) {
    console.error("No connected facebook channel for page", pageId);
    process.exit(2);
  }
  const token = String((match.config as any)?.accessToken || "");
  if (!token) {
    console.error("No page token");
    process.exit(2);
  }

  const psidContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, match.userId), sql`${contacts.facebookId} is not null`));

  let repaired = 0;
  for (const c of psidContacts) {
    const psid = String(c.facebookId || "");
    if (!psid) continue;
    if (c.name !== psid && !/^\d{15,}$/.test((c.name || "").trim())) continue;

    const [msg] = await db
      .select({ mid: messages.externalMessageId })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(conversations.userId, match.userId),
          eq(conversations.contactId, c.id),
          eq(messages.direction, "inbound"),
          sql`${messages.externalMessageId} is not null`,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);

    const profile = await fetchFacebookSenderProfile(psid, token, {
      pageIdForLog: pageId,
      userIdForLog: match.userId,
      contactIdForLog: c.id,
      messageMid: msg?.mid ?? null,
    });
    const patch = buildFacebookContactNamePatch(
      c.name,
      psid,
      profile?.displayName,
      mergeFacebookDisplayNameSource(c.sourceDetails, "psid"),
    );
    if (!patch && !profile?.profilePic) {
      console.log("[repair] no enrichment", { contactId: c.id, psid });
      continue;
    }
    await storage.updateContact(c.id, {
      ...(patch || {}),
      ...(profile?.profilePic
        ? { avatar: profile.profilePic, avatarFetchedAt: new Date() }
        : {}),
    });
    repaired += 1;
    console.log("[repair] updated", {
      contactId: c.id,
      psid,
      name: patch?.name ?? c.name,
      avatarPresent: Boolean(profile?.profilePic),
      source: profile?.source ?? null,
    });
  }
  console.log("[repair] done", { repaired, pageId, userId: match.userId });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
