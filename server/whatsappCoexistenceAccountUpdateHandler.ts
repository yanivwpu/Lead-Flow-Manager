/**
 * Mark a Coexistence connection as needing attention after a supported
 * WhatsApp account_update offboarding/invalidation signal.
 * Preserves WABA/phone/connectionType for diagnosis; does not convert to embedded.
 */
import { eq, and } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { storage } from "./storage";
import type { MetaWhatsappAccountUpdateEvent } from "../shared/whatsappCoexistenceAccountUpdate";

export async function applyCoexistenceAccountUpdateAttention(
  event: MetaWhatsappAccountUpdateEvent,
): Promise<{ matchedUserId: string | null; updated: boolean }> {
  let matched:
    | {
        id: string;
        metaConnectionType: string | null;
        metaPhoneNumberId: string | null;
        metaBusinessAccountId: string | null;
      }
    | undefined;

  if (event.phoneNumberId) {
    const rows = await db
      .select({
        id: users.id,
        metaConnectionType: users.metaConnectionType,
        metaPhoneNumberId: users.metaPhoneNumberId,
        metaBusinessAccountId: users.metaBusinessAccountId,
      })
      .from(users)
      .where(eq(users.metaPhoneNumberId, event.phoneNumberId))
      .limit(2);
    if (rows.length > 1) {
      console.error(
        "[Meta WhatsApp] CRITICAL account_update routing blocked: duplicate phone ownership",
        { phoneNumberIdLast6: event.phoneNumberId.slice(-6), ownerCount: rows.length },
      );
      return { matchedUserId: null, updated: false };
    }
    matched = rows[0];
  } else if (event.wabaId) {
    const rows = await db
      .select({
        id: users.id,
        metaConnectionType: users.metaConnectionType,
        metaPhoneNumberId: users.metaPhoneNumberId,
        metaBusinessAccountId: users.metaBusinessAccountId,
      })
      .from(users)
      .where(
        and(eq(users.metaBusinessAccountId, event.wabaId), eq(users.metaConnectionType, "coexistence")),
      )
      .limit(2);
    if (rows.length !== 1) {
      console.warn("[Meta WhatsApp] account_update WABA match ambiguous or missing", {
        wabaIdLast6: event.wabaId.slice(-6),
        matchCount: rows.length,
        kind: event.kind,
      });
      return { matchedUserId: null, updated: false };
    }
    matched = rows[0];
  }

  if (!matched) return { matchedUserId: null, updated: false };
  if (matched.metaConnectionType !== "coexistence") {
    // Do not reinterpret Standard Embedded connections from ambiguous account_update shapes.
    return { matchedUserId: matched.id, updated: false };
  }

  const message =
    event.kind === "partner_removed"
      ? "WhatsApp Business App companion access was removed. Reconnect to restore WhachatCRM messaging."
      : "WhatsApp Business App companion connection needs attention. Reconnect to restore messaging.";

  await storage.updateUser(matched.id, {
    metaIntegrationStatus: "needs_attention",
    metaLastErrorCode: `coexistence_${event.kind}`,
    metaLastErrorMessage: message.slice(0, 500),
    // Preserve connectionType, WABA, phone, and token for reconnect/diagnosis.
  });

  console.warn("[Meta WhatsApp] Coexistence marked needs_attention from account_update", {
    userIdTail: matched.id.slice(-6),
    kind: event.kind,
    event: event.event,
    wabaIdLast6: event.wabaId ? event.wabaId.slice(-6) : null,
    phoneNumberIdLast6: event.phoneNumberId ? event.phoneNumberId.slice(-6) : null,
  });

  return { matchedUserId: matched.id, updated: true };
}
