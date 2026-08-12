import fs from "fs";

const p = "server/whatsappEmbeddedSignup.ts";
let text = fs.readFileSync(p, "utf8");

text = text.replace(
  `}): Promise<{ success: true } | { success: false; error: string }> {
  const { state, initiatingUserId, wabaId, phoneNumberId } = params;`,
  `}): Promise<
  { success: true } | { success: false; error: string; errorCode?: "phone_workspace_conflict" }
> {
  const { state, initiatingUserId, wabaId, phoneNumberId } = params;`,
);

const badPersist = `    return {
      success: false,
      error: result.error || "Could not save WhatsApp connection.",
      errorCode: result.errorCode,
    };
  }

  await mergeUserMetaOAuthDebug(row.userId, {
    phase: "persist_integration",
    ok: true,`;

const goodPersist = `    return {
      success: false,
      error: result.error || "Could not save WhatsApp connection.",
      ...(result.errorCode === "phone_workspace_conflict"
        ? { errorCode: "phone_workspace_conflict" as const }
        : {}),
    };
  }

  await mergeUserMetaOAuthDebug(row.userId, {
    phase: "persist_integration",
    ok: true,`;

if (!text.includes(badPersist)) {
  console.error("persist block not found");
  process.exit(1);
}
text = text.replace(badPersist, goodPersist);

const badChoose = `  if (!result.success) {
    return {
      success: false,
      error: result.error || "Could not save WhatsApp connection.",
      errorCode: result.errorCode,
    };
  }

  // Immediately verify the phone node for routing readiness / registration need.`;

const goodChoose = `  if (!result.success) {
    return {
      success: false,
      error: result.error || "Could not save WhatsApp connection.",
      ...(result.errorCode === "phone_workspace_conflict"
        ? { errorCode: "phone_workspace_conflict" as const }
        : {}),
    };
  }

  // Immediately verify the phone node for routing readiness / registration need.`;

if (!text.includes(badChoose)) {
  console.error("choose block not found");
  process.exit(1);
}
text = text.replace(badChoose, goodChoose);

fs.writeFileSync(p, text);
console.log("patched ts errors");
