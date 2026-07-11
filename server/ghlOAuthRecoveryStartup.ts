import { parseProspectImportAllowedEmails } from "@shared/prospectImportAccess";
import {
  isGhlOAuthRecoveryAllowlisted,
  parseGhlOAuthRecoveryAllowedEmails,
} from "@shared/ghlOAuthRecoveryAccess";

const STARTUP_PROBE_EMAIL = "yahabegood@gmail.com";

export type GhlOAuthRecoveryAllowlistStartupSnapshot = {
  tag: "[GHL-OAuth-Recovery]";
  event: "startup_allowlist_config";
  gitSha: string | null;
  prospectImportAllowedEmailsEnvRaw: string | null;
  prospectImportAllowedEmailsParsed: string[];
  ghlOAuthRecoveryAllowedEmailsEnvRaw: string | null;
  ghlOAuthRecoveryAllowedEmailsEnvParsed: string[];
  ghlOAuthRecoveryAllowedEmailsEffective: string[];
  startupProbeEmail: string;
  startupProbeEmailAllowlisted: boolean;
};

export function buildGhlOAuthRecoveryAllowlistStartupSnapshot(): GhlOAuthRecoveryAllowlistStartupSnapshot {
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

  const gitSha =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.COMMIT_SHA ||
    null;

  return {
    tag: "[GHL-OAuth-Recovery]",
    event: "startup_allowlist_config",
    gitSha,
    prospectImportAllowedEmailsEnvRaw: prospectImportEnvRaw || null,
    prospectImportAllowedEmailsParsed: prospectImportAllowedEmails,
    ghlOAuthRecoveryAllowedEmailsEnvRaw: recoveryEnvRaw || null,
    ghlOAuthRecoveryAllowedEmailsEnvParsed: recoveryEnvParsed,
    ghlOAuthRecoveryAllowedEmailsEffective: recoveryAllowedEmailsEffective,
    startupProbeEmail: STARTUP_PROBE_EMAIL,
    startupProbeEmailAllowlisted: isGhlOAuthRecoveryAllowlisted(STARTUP_PROBE_EMAIL),
  };
}

/** Log GHL OAuth recovery allowlist config (Railway-visible, searchable prefix). */
export function logGhlOAuthRecoveryAllowlistAtStartup(source = "boot"): void {
  const snapshot = buildGhlOAuthRecoveryAllowlistStartupSnapshot();
  // Searchable plain prefix for Railway log filter: [GHL-OAuth-Recovery] startup_allowlist_config
  console.log("[GHL-OAuth-Recovery] startup_allowlist_config", { source, ...snapshot });
  console.log(JSON.stringify({ source, ...snapshot }));
}
