/**
 * Resolve opaque widget public IDs to workspace owners.
 * Never treats users.id as a public widget token unless the temporary legacy flag is on.
 */

import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { isUuidLike, isWidgetPublicId, looksLikeRawTenantUserId } from "@shared/opaquePublicToken";
import { generateWidgetPublicId } from "./opaquePublicId";
import { storage } from "./storage";

export const WEBCHAT_LEGACY_USER_ID_ENV = "WEBCHAT_LEGACY_USER_ID_WIDGET";

export function isLegacyUserIdWidgetEnabled(): boolean {
  const v = (process.env[WEBCHAT_LEGACY_USER_ID_ENV] || "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export type WidgetOwner = {
  userId: string;
  widgetPublicId: string;
  widgetSettings: Record<string, unknown>;
  businessName: string;
  language: string | null;
};

function asSettings(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

async function rowToOwner(row: typeof users.$inferSelect): Promise<WidgetOwner | null> {
  if (!row?.id) return null;
  let publicId = row.widgetPublicId || "";
  if (!publicId || !isWidgetPublicId(publicId)) {
    publicId = await ensureWidgetPublicId(row.id);
  }
  return {
    userId: row.id,
    widgetPublicId: publicId,
    widgetSettings: asSettings(row.widgetSettings),
    businessName: (row as { businessName?: string }).businessName || row.name || "",
    language: row.language || null,
  };
}

export async function ensureWidgetPublicId(userId: string): Promise<string> {
  const existing = await db
    .select({ id: users.id, widgetPublicId: users.widgetPublicId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = existing[0];
  if (row?.widgetPublicId && isWidgetPublicId(row.widgetPublicId)) {
    return row.widgetPublicId;
  }
  for (let i = 0; i < 5; i++) {
    const next = generateWidgetPublicId();
    try {
      await db.update(users).set({ widgetPublicId: next }).where(eq(users.id, userId));
      return next;
    } catch {
      // unique collision — retry
    }
  }
  throw new Error("widget_public_id_alloc_failed");
}

export async function rotateWidgetPublicId(userId: string): Promise<string> {
  const next = generateWidgetPublicId();
  await db
    .update(users)
    .set({ widgetPublicId: next, widgetPublicIdRotatedAt: new Date() })
    .where(eq(users.id, userId));
  return next;
}

export async function getWidgetOwnerByPublicId(publicId: string): Promise<WidgetOwner | null> {
  const token = (publicId || "").trim();
  if (!token) return null;

  if (isWidgetPublicId(token)) {
    const rows = await db.select().from(users).where(eq(users.widgetPublicId, token)).limit(1);
    return rows[0] ? rowToOwner(rows[0]) : null;
  }

  if (looksLikeRawTenantUserId(token) || isUuidLike(token)) {
    if (!isLegacyUserIdWidgetEnabled()) {
      console.warn(
        JSON.stringify({
          tag: "[WebchatWidget]",
          event: "rejected_raw_user_id",
          tokenKind: "uuid",
        }),
      );
      return null;
    }
    console.warn(
      JSON.stringify({
        tag: "[WebchatWidget]",
        event: "legacy_user_id_resolved",
        flag: WEBCHAT_LEGACY_USER_ID_ENV,
      }),
    );
    const user = await storage.getUserForSession(token);
    return user ? rowToOwner(user) : null;
  }

  return null;
}

export async function getWidgetPublicIdForUser(userId: string): Promise<string> {
  return ensureWidgetPublicId(userId);
}
