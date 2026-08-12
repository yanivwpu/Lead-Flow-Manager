import fs from "fs";

const p = "server/whatsappEmbeddedSignup.ts";
let text = fs.readFileSync(p, "utf8");
const old = `  if (!result.success) {
    result = await connectUserMeta(row.userId, credentials, {
      connectionType,
      displayPhoneNumber: matchPhone.displayPhoneNumber ?? null,
      verifiedName: matchPhone.verifiedName ?? null,
      webhookSubscribed: subscribed,
      tokenExpiresAt: null,
      metaIntegrationStatus: subscribed ? "connected" : "needs_attention",
      skipCredentialValidation: true,
    });
  }

  if (!result.success) {
    return { success: false, error: result.error || "Could not save WhatsApp connection." };
  }

  // Immediately verify the phone node for routing readiness / registration need.`;

const neu = `  if (!result.success) {
    if (result.errorCode === "phone_workspace_conflict") {
      return {
        success: false,
        error: result.error || META_PHONE_NUMBER_WORKSPACE_CONFLICT_MESSAGE,
        errorCode: "phone_workspace_conflict",
      };
    }
    result = await connectUserMeta(row.userId, credentials, {
      connectionType,
      displayPhoneNumber: matchPhone.displayPhoneNumber ?? null,
      verifiedName: matchPhone.verifiedName ?? null,
      webhookSubscribed: subscribed,
      tokenExpiresAt: null,
      metaIntegrationStatus: subscribed ? "connected" : "needs_attention",
      skipCredentialValidation: true,
    });
  }

  if (!result.success) {
    return {
      success: false,
      error: result.error || "Could not save WhatsApp connection.",
      errorCode: result.errorCode,
    };
  }

  // Immediately verify the phone node for routing readiness / registration need.`;

if (!text.includes(old)) {
  console.error("old block not found");
  process.exit(1);
}
fs.writeFileSync(p, text.replace(old, neu));
console.log("patched");
