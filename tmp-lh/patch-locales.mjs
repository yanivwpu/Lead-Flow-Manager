import fs from "fs";

for (const f of [
  "client/src/locales/en.json",
  "client/src/locales/es.json",
  "client/src/locales/he.json",
]) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const errors = j.whatsappEmbeddedSignup?.errors;
  if (!errors) {
    console.log("no errors in", f);
    continue;
  }
  errors.phone_workspace_conflict = {
    message: "This WhatsApp number is already connected to another WhachatCRM account.",
    recovery: "Disconnect it from the other account, or use a different number.",
  };
  errors.sdk_launch_failed = {
    message:
      "We couldn't open the secure WhatsApp connection window. Please allow pop-ups and try again.",
    recovery: "Allow pop-ups for this site, then click Connect WhatsApp again.",
  };
  for (const v of Object.values(errors)) {
    if (v && typeof v === "object") {
      const row = /** @type {{ message?: string; recovery?: string }} */ (v);
      if (typeof row.message === "string") {
        row.message = row.message.replace(/Continue with Meta/g, "Connect WhatsApp");
      }
      if (typeof row.recovery === "string") {
        row.recovery = row.recovery.replace(/Continue with Meta/g, "Connect WhatsApp");
      }
    }
  }
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log("updated", f);
}
