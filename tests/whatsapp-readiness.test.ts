import {
  evaluateMetaWhatsAppReadiness,
  isCanonicalMetaWhatsAppFullyConnected,
  isCanonicalWhatsAppFullyConnectedFromUser,
  isValidMetaWhatsAppGraphId,
} from "../shared/whatsappReadiness";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function run() {
  assert(isValidMetaWhatsAppGraphId("123456789012345"), "valid id");
  assert(!isValidMetaWhatsAppGraphId("abc"), "invalid id");

  const readyUser = {
    whatsappProvider: "meta",
    metaConnected: true,
    metaWebhookSubscribed: true,
    metaIntegrationStatus: "connected",
    metaPhoneNumberId: "123456789012345",
    metaBusinessAccountId: "987654321098765",
  };

  assert(isCanonicalMetaWhatsAppFullyConnected(readyUser), "canonical meta ready");
  const evalReady = evaluateMetaWhatsAppReadiness(readyUser, {
    phoneGraphStatus: "CONNECTED",
    phoneGraphCodeVerification: "VERIFIED",
  });
  assert(evalReady.fullyReady, "fully ready");
  assert(evalReady.inboxReady, "inbox ready");

  const partial = {
    ...readyUser,
    metaWebhookSubscribed: false,
    metaIntegrationStatus: "needs_attention",
  };
  assert(!isCanonicalWhatsAppFullyConnectedFromUser(partial), "not canonical when webhook missing");
  const evalPartial = evaluateMetaWhatsAppReadiness(partial);
  assert(evalPartial.setupIncomplete, "setup incomplete flag");
  assert(!evalPartial.fullyReady, "not fully ready");
  assert(!evalPartial.webhookSubscribed, "webhook step false");

  console.log("whatsapp-readiness.test.ts: all passed");
}

run();
