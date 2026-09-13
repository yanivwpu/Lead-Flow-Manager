/**
 * Narrow workspace fields for Web Chat inbound away-reply + AI Auto.
 * Do not use getUser (auth-core omits widgetSettings) or getUserForSession
 * (full row includes auth secrets and integration tokens).
 */

import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import type { WebchatAwayUser } from "@shared/webchatReplyPolicy";
import { db } from "../drizzle/db";

export type WebchatInboundReplySettings = WebchatAwayUser & {
  id: string;
  widgetSettings: Record<string, unknown>;
};

export function extractWidgetSettingsRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** AI Auto only needs the public widget enabled flag — never the rest of widget JSON. */
export function widgetSettingsForAiDispatch(raw: unknown): { enabled: boolean } {
  return { enabled: extractWidgetSettingsRecord(raw).enabled === true };
}

export function mapWebchatInboundReplySettings(row: {
  id: string;
  widgetSettings?: unknown;
  businessHoursEnabled?: boolean | null;
  awayMessageEnabled?: boolean | null;
  awayMessage?: string | null;
  timezone?: string | null;
  businessDays?: unknown;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
}): WebchatInboundReplySettings {
  return {
    id: row.id,
    widgetSettings: extractWidgetSettingsRecord(row.widgetSettings),
    businessHoursEnabled: row.businessHoursEnabled ?? null,
    awayMessageEnabled: row.awayMessageEnabled ?? null,
    awayMessage: row.awayMessage ?? null,
    timezone: row.timezone ?? null,
    businessDays: row.businessDays,
    businessHoursStart: row.businessHoursStart ?? null,
    businessHoursEnd: row.businessHoursEnd ?? null,
  };
}

export async function getWebchatInboundReplySettings(
  userId: string,
): Promise<WebchatInboundReplySettings | undefined> {
  const rows = await db
    .select({
      id: users.id,
      widgetSettings: users.widgetSettings,
      businessHoursEnabled: users.businessHoursEnabled,
      awayMessageEnabled: users.awayMessageEnabled,
      awayMessage: users.awayMessage,
      timezone: users.timezone,
      businessDays: users.businessDays,
      businessHoursStart: users.businessHoursStart,
      businessHoursEnd: users.businessHoursEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row?.id) return undefined;
  return mapWebchatInboundReplySettings(row);
}
