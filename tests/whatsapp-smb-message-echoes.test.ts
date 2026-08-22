/**
 * WhatsApp Coexistence smb_message_echoes parser + webhook wiring.
 * Run: npx tsx --test tests/whatsapp-smb-message-echoes.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  COEXISTENCE_WHATSAPP_WEBHOOK_FIELDS,
  isCoexistenceMetaConnection,
  parseSmbMessageEchoesWebhook,
  SMB_MESSAGE_ECHOES_FIELD,
} from "../shared/whatsappSmbMessageEchoes";
import { parseMetaIncomingWebhook, parseMetaStatusWebhook } from "../server/userMeta";

const PHONE_NUMBER_ID = "106540352242922";
const WAMID = "wamid.echo_text_1";

function echoPayload(overrides: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "102290129340398",
        changes: [
          {
            field: SMB_MESSAGE_ECHOES_FIELD,
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550783881",
                phone_number_id: PHONE_NUMBER_ID,
              },
              message_echoes: [
                {
                  from: "15550783881",
                  to: "16505551234",
                  id: WAMID,
                  timestamp: "1739321024",
                  type: "text",
                  text: { body: "Here's the info you requested" },
                  ...overrides,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function inboundPayload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "102290129340398",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550783881",
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: "Customer" }, wa_id: "16505551234" }],
              messages: [
                {
                  from: "16505551234",
                  id: "wamid.inbound_1",
                  timestamp: "1739321000",
                  type: "text",
                  text: { body: "Hi, I have a question" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("smb_message_echoes parser", () => {
  it("parses Business App text echo as outbound-shaped create", () => {
    const parsed = parseSmbMessageEchoesWebhook(echoPayload());
    assert.ok(parsed);
    assert.equal(parsed.phoneNumberId, PHONE_NUMBER_ID);
    assert.equal(parsed.echoCount, 1);
    assert.equal(parsed.echoes[0].action, "create");
    assert.equal(parsed.echoes[0].type, "text");
    assert.equal(parsed.echoes[0].contentType, "text");
    assert.equal(parsed.echoes[0].to, "16505551234");
    assert.equal(parsed.echoes[0].from, "15550783881");
    assert.equal(parsed.echoes[0].id, WAMID);
    assert.equal(parsed.echoes[0].content, "Here's the info you requested");
  });

  it("does not treat echoes as inbound messages or statuses", () => {
    const body = echoPayload();
    assert.equal(parseMetaIncomingWebhook(body), null);
    assert.equal(parseMetaStatusWebhook(body), null);
  });

  it("leaves Standard inbound messages parseable", () => {
    const inbound = parseMetaIncomingWebhook(inboundPayload());
    assert.ok(inbound);
    assert.equal(inbound.from, "16505551234");
    assert.equal(inbound.messageId, "wamid.inbound_1");
    assert.equal(inbound.type, "text");
    assert.equal(parseSmbMessageEchoesWebhook(inboundPayload()), null);
  });

  it("skips unsupported echo types with an explicit reason", () => {
    const parsed = parseSmbMessageEchoesWebhook(echoPayload({ type: "reaction", reaction: { emoji: "👍" } }));
    assert.ok(parsed);
    assert.equal(parsed.echoes[0].action, "skip");
    assert.match(parsed.echoes[0].skipReason || "", /unsupported_echo_type:reaction/);
  });

  it("parses image, edit, and revoke without using inbound messages[]", () => {
    const image = parseSmbMessageEchoesWebhook(
      echoPayload({
        type: "image",
        text: undefined,
        image: { id: "media-1", mime_type: "image/jpeg", caption: "Look" },
      }),
    );
    assert.equal(image?.echoes[0].action, "create");
    assert.equal(image?.echoes[0].contentType, "image");
    assert.equal(image?.echoes[0].mediaId, "media-1");

    const revoke = parseSmbMessageEchoesWebhook(
      echoPayload({
        type: "revoke",
        text: undefined,
        revoke: { original_message_id: "wamid.original" },
      }),
    );
    assert.equal(revoke?.echoes[0].action, "revoke");
    assert.equal(revoke?.echoes[0].originalMessageId, "wamid.original");

    const edit = parseSmbMessageEchoesWebhook(
      echoPayload({
        type: "edit",
        text: undefined,
        edit: {
          original_message_id: "wamid.original",
          message: { type: "text", text: { body: "Updated" } },
        },
      }),
    );
    assert.equal(edit?.echoes[0].action, "edit");
    assert.equal(edit?.echoes[0].content, "Updated");
  });
});

describe("coexistence subscription + routing wiring", () => {
  it("documents required Coexistence webhook fields including smb_message_echoes", () => {
    assert.ok(COEXISTENCE_WHATSAPP_WEBHOOK_FIELDS.includes("messages"));
    assert.ok(COEXISTENCE_WHATSAPP_WEBHOOK_FIELDS.includes("smb_message_echoes"));
    assert.ok(COEXISTENCE_WHATSAPP_WEBHOOK_FIELDS.includes("smb_app_state_sync"));
    assert.ok(COEXISTENCE_WHATSAPP_WEBHOOK_FIELDS.includes("history"));
    assert.equal(isCoexistenceMetaConnection("coexistence"), true);
    assert.equal(isCoexistenceMetaConnection("embedded"), false);
    assert.equal(isCoexistenceMetaConnection("embedded_signup"), false);
  });

  it("webhook router recognizes smb_message_echoes and does not drop it as inbound", () => {
    const routes = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
    assert.match(routes, /handleSmbMessageEchoesWebhook/);
    assert.match(routes, /smb_message_echoes handling failed/);
    assert.match(routes, /smbEchoHandled/);
    assert.match(routes, /smbMessageEchoCount/);

    const handler = fs.readFileSync(
      path.join(process.cwd(), "server/whatsappSmbMessageEchoHandler.ts"),
      "utf8",
    );
    assert.match(handler, /isCoexistenceMetaConnection/);
    assert.match(handler, /not_coexistence/);
    assert.match(handler, /persistWhatsAppBusinessAppOutboundEcho/);

    const persist = fs.readFileSync(path.join(process.cwd(), "server/channelService.ts"), "utf8");
    assert.match(persist, /persistWhatsAppBusinessAppOutboundEcho/);
    assert.match(persist, /scheduleNoReplyJobsAfterTeamOutbound/);
    assert.match(persist, /direction: "outbound"/);
    assert.match(persist, /source: "smb_message_echoes"/);
    assert.match(persist, /getMessageByUserExternalId/);
    assert.doesNotMatch(
      persist.slice(
        persist.indexOf("persistWhatsAppBusinessAppOutboundEcho"),
        persist.indexOf("async logActivity"),
      ),
      /onInboundMessageForNoReplyTimers/,
    );
  });

  it("WABA subscribed_apps does not claim to set smb_message_echoes fields", () => {
    const signup = fs.readFileSync(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    assert.match(signup, /smb_message_echoes/);
    assert.match(signup, /does not set those field checkboxes/);
    const diagnostics = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    assert.match(diagnostics, /requiredForCoexistence/);
    assert.match(diagnostics, /smb_message_echoes/);
  });
});
