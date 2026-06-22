import {
  WHATSAPP_SETUP_INCOMPLETE_BANNER,
  WHATSAPP_SETUP_INCOMPLETE_SUBTITLE,
  isWhatsAppSetupIncompleteError,
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
    resolveWhatsAppActiveProvider({ whatsappProvider: "meta" }) === "meta",
    "explicit meta pref",
  );
  assert(
    resolveWhatsAppActiveProvider({ whatsappProvider: "twilio", twilioConnected: true }) === "twilio",
    "explicit twilio pref",
  );

  assert(
    whatsappSetupIncompleteSubtitle({ activeProvider: "none" }) === WHATSAPP_SETUP_INCOMPLETE_SUBTITLE,
    "neutral subtitle for none",
  );
  assert(
    whatsappSetupIncompleteSubtitle({ activeProvider: "meta", metaConnected: false }) ===
      WHATSAPP_SETUP_INCOMPLETE_SUBTITLE,
    "neutral subtitle for meta",
  );
  assert(
    whatsappSetupIncompleteSubtitle({ activeProvider: "twilio" }) === WHATSAPP_SETUP_INCOMPLETE_SUBTITLE,
    "neutral subtitle for twilio",
  );
  assert(
    !WHATSAPP_SETUP_INCOMPLETE_BANNER.toLowerCase().includes("twilio"),
    "banner has no twilio",
  );
  assert(
    !WHATSAPP_SETUP_INCOMPLETE_BANNER.toLowerCase().includes("meta connection"),
    "banner has no meta connection phrase",
  );
  assert(
    whatsappSetupIncompleteBannerText({ activeProvider: "twilio" }) === WHATSAPP_SETUP_INCOMPLETE_BANNER,
    "banner text constant",
  );

  const blocker = metaWhatsAppReadinessBlockerMessage({
    wabaSaved: false,
    phoneSaved: true,
    phoneStatusReady: true,
    webhookSubscribed: true,
    inboxReady: true,
  });
  assert(blocker?.includes("WABA"), "checklist blocker still available for settings UI");

  assert(
    isWhatsAppSetupIncompleteError(WHATSAPP_SETUP_INCOMPLETE_BANNER),
    "detects setup incomplete banner",
  );
  assert(
    !isWhatsAppSetupIncompleteError("Network error: request failed"),
    "ignores unrelated errors",
  );

  console.log("whatsapp-setup-messages.test.ts: all passed");
}

run();
