import {
  metaWhatsAppReadinessBlockerMessage,
  resolveWhatsAppActiveProvider,
  whatsappSetupIncompleteBannerText,
  whatsappSetupIncompleteSubtitle,
} from "../shared/whatsappSetupMessages";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function run() {
  assert(resolveWhatsAppActiveProvider({}) === "none", "empty user → none");
  assert(
    resolveWhatsAppActiveProvider({ whatsappProvider: "meta", metaConnected: false }) === "meta",
    "explicit meta pref",
  );
  assert(
    resolveWhatsAppActiveProvider({ whatsappProvider: "twilio", twilioConnected: true }) === "twilio",
    "explicit twilio pref",
  );
  assert(
    resolveWhatsAppActiveProvider({ metaConnected: true }) === "meta",
    "legacy infer meta",
  );

  assert(
    whatsappSetupIncompleteSubtitle({ activeProvider: "none" }).includes("connect WhatsApp"),
    "none subtitle",
  );
  assert(
    whatsappSetupIncompleteSubtitle({ activeProvider: "meta", metaConnected: false }).includes("Meta"),
    "meta not connected",
  );
  assert(
    whatsappSetupIncompleteSubtitle({ activeProvider: "twilio" }).includes("Twilio"),
    "twilio subtitle",
  );
  assert(
    !whatsappSetupIncompleteSubtitle({ activeProvider: "meta", metaConnected: false }).includes("Twilio"),
    "meta subtitle not twilio",
  );

  const blocker = metaWhatsAppReadinessBlockerMessage({
    wabaSaved: false,
    phoneSaved: true,
    phoneStatusReady: true,
    webhookSubscribed: true,
    inboxReady: true,
  });
  assert(blocker?.includes("WABA"), "waba blocker");

  const withBlocker = whatsappSetupIncompleteSubtitle({
    activeProvider: "meta",
    metaConnected: true,
    readiness: {
      wabaSaved: false,
      phoneSaved: true,
      phoneStatusReady: true,
      webhookSubscribed: true,
      inboxReady: true,
    },
  });
  assert(withBlocker.includes("WABA"), "subtitle includes blocker");

  assert(
    whatsappSetupIncompleteBannerText({ activeProvider: "none" }).startsWith("WhatsApp setup incomplete —"),
    "banner prefix",
  );

  console.log("whatsapp-setup-messages.test.ts: all passed");
}

run();
