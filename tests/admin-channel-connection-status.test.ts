import {
  deriveAdminEmailIndicator,
  deriveAdminUserChannelConnections,
  deriveAdminWhatsAppIndicator,
  pickAdminEmailMailbox,
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
  assert(none.email.state === "disconnected", "no mailbox → email disconnected");
  assert(!none.emailConnected, "account email is not a mailbox");

  const gmailOn = deriveAdminEmailIndicator({ syncStatus: "connected", provider: "gmail" });
  assert(gmailOn.state === "connected", "gmail connected");
  assert(gmailOn.tooltip === "Gmail / Email", "gmail tooltip");

  const gmailSyncing = deriveAdminEmailIndicator({ syncStatus: "syncing", provider: "gmail" });
  assert(gmailSyncing.state === "connected", "syncing counts as connected");

  const gmailOff = deriveAdminEmailIndicator({ syncStatus: "disconnected", provider: "gmail" });
  assert(gmailOff.state === "disconnected", "gmail disconnected");

  const noMailbox = deriveAdminEmailIndicator(null);
  assert(noMailbox.state === "disconnected", "missing mailbox is not connected");

  const picked = pickAdminEmailMailbox([
    { syncStatus: "disconnected", provider: "gmail", isPrimary: true },
    { syncStatus: "connected", provider: "gmail", isPrimary: false },
  ]);
  assert(picked?.syncStatus === "connected", "prefer UI-connected mailbox over primary disconnected");

  const emailOnly = deriveAdminUserChannelConnections({
    user: { whatsappProvider: "meta", metaConnected: false },
    channelSettings: [],
    emailMailbox: { syncStatus: "connected", provider: "gmail" },
  });
  assert(emailOnly.emailConnected, "gmail mailbox → email connected");
  assert(emailOnly.noChannelsConnected === false, "email counts as a channel");
  assert(emailOnly.whatsapp.state === "disconnected", "WA unchanged when only email is on");
  assert(emailOnly.facebook.state === "disconnected", "FB unchanged");
  assert(emailOnly.instagram.state === "disconnected", "IG unchanged");

  const waFbIgUnchanged = deriveAdminUserChannelConnections({
    user: {
      whatsappProvider: "meta",
      metaConnected: true,
      metaIntegrationStatus: "connected",
      metaWebhookSubscribed: true,
    },
    channelSettings: [
      {
        channel: "facebook",
        isConnected: true,
        config: { pageName: "Page", pageId: "1", accessToken: "x" },
      },
      {
        channel: "instagram",
        isConnected: true,
        config: { pageId: "2", accessToken: "y", instagramUsername: "shop" },
      },
    ],
    emailMailbox: { syncStatus: "disconnected", provider: "gmail" },
  });
  assert(waFbIgUnchanged.whatsapp.state === "connected", "WA still green");
  assert(waFbIgUnchanged.facebook.state === "connected", "FB still green");
  assert(waFbIgUnchanged.instagram.state === "connected", "IG still green");
  assert(waFbIgUnchanged.email.state === "disconnected", "disconnected mailbox is not EM-connected");

  console.log("admin-channel-connection-status.test.ts OK");
}

run();
