import {
  deriveAdminUserChannelConnections,
  deriveAdminWhatsAppIndicator,
} from "../shared/adminChannelConnectionStatus";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function run() {
  const metaReady = deriveAdminWhatsAppIndicator({
    whatsappProvider: "meta",
    metaConnected: true,
    metaIntegrationStatus: "connected",
    metaWebhookSubscribed: true,
    metaVerifiedName: "WhachatCRM",
  });
  assert(metaReady.state === "connected", "meta green");
  assert(metaReady.tooltip.includes("WhachatCRM"), "meta tooltip label");

  const metaWebhook = deriveAdminWhatsAppIndicator({
    whatsappProvider: "meta",
    metaConnected: true,
    metaIntegrationStatus: "connected",
    metaWebhookSubscribed: false,
  });
  assert(metaWebhook.state === "attention", "webhook missing -> yellow");
  assert(metaWebhook.tooltip.includes("webhook not subscribed"), "webhook tooltip");

  const metaFailed = deriveAdminWhatsAppIndicator({
    whatsappProvider: "meta",
    metaConnected: true,
    metaIntegrationStatus: "failed",
    metaLastErrorMessage: "Token invalid",
  });
  assert(metaFailed.state === "error", "failed -> red");

  const fb = deriveAdminUserChannelConnections({
    user: { whatsappProvider: "meta", metaConnected: false },
    channelSettings: [
      {
        channel: "facebook",
        isConnected: true,
        config: { pageName: "WhachatCRM", pageId: "1234567890", accessToken: "x" },
      },
    ],
  });
  assert(fb.facebook.state === "connected", "facebook green");
  assert(fb.facebook.tooltip.includes("WhachatCRM"), "facebook page name");
  assert(fb.noChannelsConnected === false, "has facebook");
  assert(fb.needsAttention === false, "green fb + gray wa is not needs attention");

  const none = deriveAdminUserChannelConnections({
    user: { whatsappProvider: "meta", metaConnected: false },
    channelSettings: [],
  });
  assert(none.noChannelsConnected, "all disconnected");
  assert(!none.whatsappConnected, "wa not connected");

  console.log("admin-channel-connection-status.test.ts OK");
}

run();
