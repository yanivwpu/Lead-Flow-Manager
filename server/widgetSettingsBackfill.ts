/**
 * Idempotent fingerprint-only cleanup of untouched schema-default widget page rules.
 * Logs aggregate counts only — never customer identities.
 */

import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  applyLegacyDefaultWidgetSanitize,
  classifyWidgetSettings,
  countWidgetSettingsClasses,
  type WidgetSettingsClassCounts,
} from "@shared/webchatWidgetSettings";
import { db } from "../drizzle/db";

export async function backfillLegacyDefaultWidgetSettings(): Promise<WidgetSettingsClassCounts & { updated: number }> {
  const rows = await db.select({ id: users.id, widgetSettings: users.widgetSettings }).from(users);
  const preflight = countWidgetSettingsClasses(rows.map((r) => r.widgetSettings));

  let updated = 0;
  for (const row of rows) {
    if (classifyWidgetSettings(row.widgetSettings) !== "exact_legacy_default") continue;
    const next = applyLegacyDefaultWidgetSanitize(
      (row.widgetSettings && typeof row.widgetSettings === "object"
        ? row.widgetSettings
        : {}) as Record<string, unknown>,
    );
    await db.update(users).set({ widgetSettings: next }).where(eq(users.id, row.id));
    updated += 1;
  }

  console.log("[WidgetSettingsBackfill] preflight", {
    total: preflight.total,
    exactLegacyDefault: preflight.exactLegacyDefault,
    alreadyNeutral: preflight.alreadyNeutral,
    customized: preflight.customized,
    leftoverLegacyExampleRules: preflight.leftoverLegacyExampleRules,
    updated,
  });

  return { ...preflight, updated };
}
