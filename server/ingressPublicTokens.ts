import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { timingSafeStringEqual } from "@shared/timingSafeEqual";
import {
  isTelegramWebhookPublicId,
  isTiktokLeadPublicId,
  looksLikeRawTenantUserId,
} from "@shared/opaquePublicToken";
import { generateTelegramWebhookPublicId, generateTelegramWebhookSecret, generateTiktokLeadPublicId } from "./opaquePublicId";

export const WEBHOOK_LEGACY_USER_ID_ENV = "WEBHOOK_LEGACY_USER_ID";

function legacyUserIdWebhooksEnabled(): boolean {
  const v = (process.env[WEBHOOK_LEGACY_USER_ID_ENV] || "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export async function ensureTelegramIngress(userId: string): Promise<{
  publicId: string;
  secret: string;
}> {
  const rows = await db
    .select({
      telegramWebhookPublicId: users.telegramWebhookPublicId,
      telegramWebhookSecret: users.telegramWebhookSecret,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  let publicId = row?.telegramWebhookPublicId || "";
  let secret = row?.telegramWebhookSecret || "";
  const patch: Partial<typeof users.$inferInsert> = {};
  if (!publicId || !isTelegramWebhookPublicId(publicId)) {
    publicId = generateTelegramWebhookPublicId();
    patch.telegramWebhookPublicId = publicId;
  }
  if (!secret) {
    secret = generateTelegramWebhookSecret();
    patch.telegramWebhookSecret = secret;
  }
  if (Object.keys(patch).length) {
    await db.update(users).set(patch).where(eq(users.id, userId));
  }
  return { publicId, secret };
}

/** Read-only: settings UI must not mint or rotate tokens on GET. */
export async function getTelegramIngress(userId: string): Promise<{
  publicId: string;
  secretConfigured: boolean;
} | null> {
  const rows = await db
    .select({
      telegramWebhookPublicId: users.telegramWebhookPublicId,
      telegramWebhookSecret: users.telegramWebhookSecret,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  const publicId = row?.telegramWebhookPublicId || "";
  if (!publicId || !isTelegramWebhookPublicId(publicId)) return null;
  return { publicId, secretConfigured: Boolean(row?.telegramWebhookSecret) };
}

export async function getTiktokLeadPublicId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ tiktokLeadPublicId: users.tiktokLeadPublicId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const publicId = rows[0]?.tiktokLeadPublicId || "";
  if (!publicId || !isTiktokLeadPublicId(publicId)) return null;
  return publicId;
}

export async function ensureTiktokLeadPublicId(userId: string): Promise<string> {
  const rows = await db
    .select({ tiktokLeadPublicId: users.tiktokLeadPublicId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  let publicId = rows[0]?.tiktokLeadPublicId || "";
  if (!publicId || !isTiktokLeadPublicId(publicId)) {
    publicId = generateTiktokLeadPublicId();
    await db.update(users).set({ tiktokLeadPublicId: publicId }).where(eq(users.id, userId));
  }
  return publicId;
}

export async function resolveTelegramWebhookOwner(params: {
  pathToken: string;
  secretHeader?: string;
}): Promise<{ userId: string } | null> {
  const token = (params.pathToken || "").trim();
  if (isTelegramWebhookPublicId(token)) {
    const rows = await db
      .select({
        id: users.id,
        telegramWebhookSecret: users.telegramWebhookSecret,
      })
      .from(users)
      .where(eq(users.telegramWebhookPublicId, token))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const expected = row.telegramWebhookSecret || "";
    if (!expected || !timingSafeStringEqual(params.secretHeader || "", expected)) return null;
    return { userId: row.id };
  }
  if (looksLikeRawTenantUserId(token) && legacyUserIdWebhooksEnabled()) {
    const rows = await db
      .select({
        id: users.id,
        telegramWebhookSecret: users.telegramWebhookSecret,
      })
      .from(users)
      .where(eq(users.id, token))
      .limit(1);
    const row = rows[0];
    if (!row?.telegramWebhookSecret || !timingSafeStringEqual(params.secretHeader || "", row.telegramWebhookSecret)) {
      return null;
    }
    console.warn(JSON.stringify({ tag: "[TelegramWebhook]", event: "legacy_user_id_resolved" }));
    return { userId: row.id };
  }
  return null;
}

export async function resolveTiktokLeadOwner(pathToken: string): Promise<{ userId: string } | null> {
  const token = (pathToken || "").trim();
  if (!isTiktokLeadPublicId(token)) return null;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tiktokLeadPublicId, token))
    .limit(1);
  return rows[0] ? { userId: rows[0].id } : null;
}
