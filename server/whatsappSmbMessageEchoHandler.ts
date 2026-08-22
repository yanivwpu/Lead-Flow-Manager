/**
 * Coexistence-only handler for Meta `smb_message_echoes` webhooks.
 * Does not log message bodies, phone numbers, or tokens.
 */
import { findUserByMetaPhoneNumberId } from "./userMeta";
import { channelService } from "./channelService";
import {
  isCoexistenceMetaConnection,
  parseSmbMessageEchoesWebhook,
  type ParsedSmbMessageEchoesWebhook,
  type WhatsAppSmbEchoPersistOutcome,
} from "@shared/whatsappSmbMessageEchoes";

export type SmbEchoHandleResult = {
  handled: boolean;
  phoneNumberIdPresent: boolean;
  connectionType: string | null;
  echoCount: number;
  results: Array<{
    outcome: WhatsAppSmbEchoPersistOutcome;
    reason?: string;
    type?: string;
    action?: string;
  }>;
};

function logEcho(event: string, extra: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      tag: "[SmbMessageEcho]",
      event,
      ...extra,
    }),
  );
}

function phoneIdTail(id: string | null | undefined): string | null {
  const s = String(id || "").trim();
  if (!s) return null;
  return s.slice(-6);
}

/**
 * Recognize and persist Business App outbound echoes.
 * Returns `handled: false` when the payload is not an smb_message_echoes event
 * (caller should continue inbound/status routing).
 */
export async function handleSmbMessageEchoesWebhook(body: unknown): Promise<SmbEchoHandleResult> {
  const parsed = parseSmbMessageEchoesWebhook(body);
  if (!parsed) {
    return {
      handled: false,
      phoneNumberIdPresent: false,
      connectionType: null,
      echoCount: 0,
      results: [],
    };
  }
  return persistParsedSmbMessageEchoes(parsed);
}

export async function persistParsedSmbMessageEchoes(
  parsed: ParsedSmbMessageEchoesWebhook,
): Promise<SmbEchoHandleResult> {
  const phoneNumberIdPresent = !!parsed.phoneNumberId;
  logEcho("received", {
    phoneNumberIdLast6: phoneIdTail(parsed.phoneNumberId),
    echoCount: parsed.echoCount,
    types: parsed.echoes.map((e) => e.type),
  });

  if (!parsed.phoneNumberId) {
    logEcho("skipped", { reason: "missing_phone_number_id", echoCount: parsed.echoCount });
    return {
      handled: true,
      phoneNumberIdPresent: false,
      connectionType: null,
      echoCount: parsed.echoCount,
      results: parsed.echoes.map(() => ({ outcome: "skipped" as const, reason: "missing_phone_number_id" })),
    };
  }

  const user = await findUserByMetaPhoneNumberId(parsed.phoneNumberId);
  if (!user) {
    logEcho("skipped", {
      reason: "user_not_found",
      phoneNumberIdLast6: phoneIdTail(parsed.phoneNumberId),
    });
    return {
      handled: true,
      phoneNumberIdPresent: true,
      connectionType: null,
      echoCount: parsed.echoCount,
      results: parsed.echoes.map(() => ({ outcome: "skipped" as const, reason: "user_not_found" })),
    };
  }

  const connectionType = user.metaConnectionType ?? null;
  if (!isCoexistenceMetaConnection(connectionType)) {
    logEcho("skipped", {
      reason: "not_coexistence",
      connectionType,
      phoneNumberIdLast6: phoneIdTail(parsed.phoneNumberId),
    });
    return {
      handled: true,
      phoneNumberIdPresent: true,
      connectionType,
      echoCount: parsed.echoCount,
      results: parsed.echoes.map(() => ({ outcome: "skipped" as const, reason: "not_coexistence" })),
    };
  }

  const results: SmbEchoHandleResult["results"] = [];
  for (const echo of parsed.echoes) {
    const persist = await channelService.persistWhatsAppBusinessAppOutboundEcho({
      userId: user.id,
      phoneNumberId: parsed.phoneNumberId,
      echo,
    });
    logEcho(persist.outcome, {
      reason: persist.reason ?? null,
      type: echo.type,
      action: echo.action,
      phoneNumberIdLast6: phoneIdTail(parsed.phoneNumberId),
      messageIdTail: persist.messageId ? String(persist.messageId).slice(-8) : null,
    });
    results.push({
      outcome: persist.outcome,
      reason: persist.reason,
      type: echo.type,
      action: echo.action,
    });
  }

  return {
    handled: true,
    phoneNumberIdPresent: true,
    connectionType,
    echoCount: parsed.echoCount,
    results,
  };
}
