/**
 * Persist Coexistence Business App echoes as outbound WhatsApp messages.
 * Run: ALLOW_DB_TEST_WRITES=1 npx tsx tests/whatsapp-smb-message-echo-persist.test.ts
 */
import assert from "node:assert/strict";
import { prepareDbTestEnvironment, teardownTestUser } from "./helpers/dbTestGuard.js";

prepareDbTestEnvironment("whatsapp-smb-message-echo-persist.test.ts");

const { storage } = await import("../server/storage");
const { channelService } = await import("../server/channelService");
const { handleSmbMessageEchoesWebhook } = await import("../server/whatsappSmbMessageEchoHandler");
const { parseSmbMessageEchoesWebhook, SMB_MESSAGE_ECHOES_FIELD } = await import(
  "../shared/whatsappSmbMessageEchoes"
);

const COEX_PHONE = `echo_coex_${Date.now()}`;
const STD_PHONE = `echo_std_${Date.now()}`;
const OTHER_PHONE = `echo_other_${Date.now()}`;
const CUSTOMER = "15555550199";

function echoBody(opts: {
  phoneNumberId: string;
  to?: string;
  id: string;
  type?: string;
  extra?: Record<string, unknown>;
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-echo-test",
        changes: [
          {
            field: SMB_MESSAGE_ECHOES_FIELD,
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550783881",
                phone_number_id: opts.phoneNumberId,
              },
              message_echoes: [
                {
                  from: "15550783881",
                  to: opts.to || CUSTOMER,
                  id: opts.id,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: opts.type || "text",
                  text: { body: "Business app reply" },
                  ...(opts.extra || {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  const createdUserIds: string[] = [];
  try {
    const coexUser = await storage.createUser({
      email: `echo-coex-${Date.now()}@test.com`,
      password: "test123",
      name: "Echo Coex User",
    });
    createdUserIds.push(coexUser.id);
    await storage.updateUser(coexUser.id, {
      metaConnected: true,
      whatsappProvider: "meta",
      metaPhoneNumberId: COEX_PHONE,
      metaConnectionType: "coexistence",
    });

    const stdUser = await storage.createUser({
      email: `echo-std-${Date.now()}@test.com`,
      password: "test123",
      name: "Echo Standard User",
    });
    createdUserIds.push(stdUser.id);
    await storage.updateUser(stdUser.id, {
      metaConnected: true,
      whatsappProvider: "meta",
      metaPhoneNumberId: STD_PHONE,
      metaConnectionType: "embedded",
    });

    const otherUser = await storage.createUser({
      email: `echo-other-${Date.now()}@test.com`,
      password: "test123",
      name: "Echo Other Tenant",
    });
    createdUserIds.push(otherUser.id);
    await storage.updateUser(otherUser.id, {
      metaConnected: true,
      whatsappProvider: "meta",
      metaPhoneNumberId: OTHER_PHONE,
      metaConnectionType: "coexistence",
    });

    // Seed existing conversation via customer inbound (F still works after echoes).
    const inbound = await channelService.processIncomingMessage({
      userId: coexUser.id,
      channel: "whatsapp",
      channelContactId: CUSTOMER,
      contactName: "Echo Customer",
      content: "Can you send details?",
      contentType: "text",
      externalMessageId: `wamid.inbound_seed_${Date.now()}`,
      channelAccountId: COEX_PHONE,
    });
    assert.equal(inbound.success, true);
    assert.ok(inbound.conversation);
    const conversationId = inbound.conversation!.id;
    const contactId = inbound.contact!.id;
    const lastInboundAt = inbound.conversation!.lastMessageAt;

    // A + B + C: Business App text echo stored as outbound on existing conversation.
    const textWamid = `wamid.app_text_${Date.now()}`;
    const handled = await handleSmbMessageEchoesWebhook(
      echoBody({ phoneNumberId: COEX_PHONE, id: textWamid }),
    );
    assert.equal(handled.handled, true);
    assert.equal(handled.connectionType, "coexistence");
    assert.equal(handled.results[0]?.outcome, "persisted");

    const outbound = await storage.getMessageByUserExternalId(coexUser.id, textWamid);
    assert.ok(outbound);
    assert.equal(outbound.direction, "outbound");
    assert.equal(outbound.conversationId, conversationId);
    assert.equal(outbound.contactId, contactId);
    assert.equal(outbound.userId, coexUser.id);
    assert.equal(outbound.content, "Business app reply");
    assert.equal(outbound.externalMessageId, textWamid);

    const convAfter = await storage.getConversation(conversationId);
    assert.ok(convAfter);
    assert.equal(convAfter.lastMessageDirection, "outbound");
    assert.ok(convAfter.lastMessageAt);
    if (lastInboundAt) {
      assert.ok(new Date(convAfter.lastMessageAt).getTime() >= new Date(lastInboundAt).getTime());
    }
    assert.match(String(convAfter.lastMessagePreview || ""), /Business app reply/);

    // D: echo uses the same team-outbound no-reply hook (does not schedule inbound-as-unanswered).
    const persistSrc = (await import("node:fs")).readFileSync("server/channelService.ts", "utf8");
    const persistBlock = persistSrc.slice(
      persistSrc.indexOf("persistWhatsAppBusinessAppOutboundEcho"),
      persistSrc.indexOf("async logActivity"),
    );
    assert.match(persistBlock, /scheduleNoReplyJobsAfterTeamOutbound/);
    assert.doesNotMatch(persistBlock, /onInboundMessageForNoReplyTimers/);

    // E: duplicate echo does not duplicate the row.
    const dup = await handleSmbMessageEchoesWebhook(
      echoBody({ phoneNumberId: COEX_PHONE, id: textWamid }),
    );
    assert.equal(dup.results[0]?.outcome, "deduped");
    const msgs = await storage.getMessages(conversationId, 50);
    const matching = msgs.filter((m) => m.externalMessageId === textWamid);
    assert.equal(matching.length, 1);

    // F: customer inbound still behaves normally after an echo.
    const inbound2 = await channelService.processIncomingMessage({
      userId: coexUser.id,
      channel: "whatsapp",
      channelContactId: CUSTOMER,
      contactName: "Echo Customer",
      content: "Thanks",
      contentType: "text",
      externalMessageId: `wamid.inbound_after_${Date.now()}`,
      channelAccountId: COEX_PHONE,
    });
    assert.equal(inbound2.success, true);
    assert.equal(inbound2.deduped, false);
    assert.equal(inbound2.conversation?.id, conversationId);
    assert.equal(inbound2.message?.direction, "inbound");

    // G: API-sent outbound with the same WhatsApp id is not duplicated by echo.
    const apiWamid = `wamid.api_sent_${Date.now()}`;
    const apiMsg = await storage.createMessage({
      conversationId,
      contactId,
      userId: coexUser.id,
      direction: "outbound",
      content: "Sent from CRM",
      contentType: "text",
      status: "sent",
      externalMessageId: apiWamid,
      sentAt: new Date(),
    });
    const apiEcho = await handleSmbMessageEchoesWebhook(
      echoBody({ phoneNumberId: COEX_PHONE, id: apiWamid, extra: { text: { body: "Sent from CRM" } } }),
    );
    assert.equal(apiEcho.results[0]?.outcome, "deduped");
    const apiAgain = await storage.getMessageByUserExternalId(coexUser.id, apiWamid);
    assert.equal(apiAgain?.id, apiMsg.id);

    // H: unsupported type fails safely (no outbound row).
    const badWamid = `wamid.reaction_${Date.now()}`;
    const parsedSkip = parseSmbMessageEchoesWebhook(
      echoBody({
        phoneNumberId: COEX_PHONE,
        id: badWamid,
        type: "reaction",
        extra: { reaction: { emoji: "👍" }, text: undefined },
      }),
    );
    assert.equal(parsedSkip?.echoes[0].action, "skip");
    const skipped = await handleSmbMessageEchoesWebhook(
      echoBody({
        phoneNumberId: COEX_PHONE,
        id: badWamid,
        type: "reaction",
        extra: { reaction: { emoji: "👍" }, text: undefined },
      }),
    );
    assert.equal(skipped.results[0]?.outcome, "skipped");
    assert.match(String(skipped.results[0]?.reason || ""), /unsupported_echo_type/);
    assert.equal(await storage.getMessageByUserExternalId(coexUser.id, badWamid), undefined);

    // I: tenant/phone routing — echo for coexistence number does not land on another workspace.
    const tenantWamid = `wamid.tenant_${Date.now()}`;
    await handleSmbMessageEchoesWebhook(echoBody({ phoneNumberId: COEX_PHONE, id: tenantWamid }));
    assert.ok(await storage.getMessageByUserExternalId(coexUser.id, tenantWamid));
    assert.equal(await storage.getMessageByUserExternalId(otherUser.id, tenantWamid), undefined);

    const otherInbound = await channelService.processIncomingMessage({
      userId: otherUser.id,
      channel: "whatsapp",
      channelContactId: CUSTOMER,
      contactName: "Other Tenant Customer",
      content: "Hello other tenant",
      contentType: "text",
      externalMessageId: `wamid.other_in_${Date.now()}`,
      channelAccountId: OTHER_PHONE,
    });
    const otherEchoId = `wamid.other_echo_${Date.now()}`;
    await handleSmbMessageEchoesWebhook(echoBody({ phoneNumberId: OTHER_PHONE, id: otherEchoId }));
    const otherEcho = await storage.getMessageByUserExternalId(otherUser.id, otherEchoId);
    assert.ok(otherEcho);
    assert.equal(otherEcho.userId, otherUser.id);
    assert.equal(otherEcho.conversationId, otherInbound.conversation?.id);
    assert.equal(await storage.getMessageByUserExternalId(coexUser.id, otherEchoId), undefined);

    // J: Standard (non-Coexistence) Cloud API numbers ignore echoes.
    const stdWamid = `wamid.std_${Date.now()}`;
    const stdResult = await handleSmbMessageEchoesWebhook(
      echoBody({ phoneNumberId: STD_PHONE, id: stdWamid }),
    );
    assert.equal(stdResult.handled, true);
    assert.equal(stdResult.results[0]?.outcome, "skipped");
    assert.equal(stdResult.results[0]?.reason, "not_coexistence");
    assert.equal(await storage.getMessageByUserExternalId(stdUser.id, stdWamid), undefined);
    assert.equal(await storage.getMessageByUserExternalId(coexUser.id, stdWamid), undefined);

    console.log("PASS whatsapp-smb-message-echo-persist: A–J");
  } finally {
    for (const id of createdUserIds.reverse()) {
      await teardownTestUser(id, "whatsapp-smb-message-echo-persist");
    }
  }
}

await main();
