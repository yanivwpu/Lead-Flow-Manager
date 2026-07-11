import { parseProspectImportAllowedEmails } from "@shared/prospectImportAccess";
import {
  isGhlOAuthRecoveryAllowlisted,
  parseGhlOAuthRecoveryAllowedEmails,
} from "@shared/ghlOAuthRecoveryAccess";

const STARTUP_PROBE_EMAIL = "yahabegood@gmail.com";

/** Log GHL OAuth recovery allowlist config once at server boot (Railway-visible). */
export function logGhlOAuthRecoveryAllowlistAtStartup(): void {
  const prospectImportEnvRaw = String(process.env.PROSPECT_IMPORT_ALLOWED_EMAILS || "").trim();
  const prospectImportAllowedEmails = parseProspectImportAllowedEmails();

  const recoveryEnvRaw = String(process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS || "").trim();
  const recoveryEnvParsed = recoveryEnvRaw
    ? recoveryEnvRaw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const recoveryAllowedEmailsEffective = parseGhlOAuthRecoveryAllowedEmails();

  console.log(
    JSON.stringify({
      tag: "[GHL-OAuth-Recovery]",
      event: "startup_allowlist_config",
      prospectImportAllowedEmailsEnvRaw: prospectImportEnvRaw || null,
      prospectImportAllowedEmailsParsed: prospectImportAllowedEmails,
      ghlOAuthRecoveryAllowedEmailsEnvRaw: recoveryEnvRaw || null,
      ghlOAuthRecoveryAllowedEmailsEnvParsed: recoveryEnvParsed,
      ghlOAuthRecoveryAllowedEmailsEffective: recoveryAllowedEmailsEffective,
      startupProbeEmail: STARTUP_PROBE_EMAIL,
      startupProbeEmailAllowlisted: isGhlOAuthRecoveryAllowlisted(STARTUP_PROBE_EMAIL),
    }),
  );
}
