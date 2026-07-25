/**
 * Production-safe Prospect AI email sender probe diagnostics.
 * Never include tokens, encryption keys, or Authorization headers.
 */

export const PROSPECT_SENDER_PROBE_FAILURE_CLASSES = [
  "decrypt",
  "token_refresh",
  "api_auth",
  "no_mailbox",
  "mailbox_disconnected",
  "other_probe_failure",
] as const;

export type ProspectSenderProbeFailureClass =
  (typeof PROSPECT_SENDER_PROBE_FAILURE_CLASSES)[number];

export const PROSPECT_SENDER_PROBE_STAGES = [
  "eligibility",
  "preferred_probe",
  "primary_probe",
  "prepare",
  "send",
] as const;

export type ProspectSenderProbeStage = (typeof PROSPECT_SENDER_PROBE_STAGES)[number];

const SENDER_NOT_CONNECTED = "sender_not_connected";

export function isSenderNotConnectedReason(reason: string | null | undefined): boolean {
  const r = String(reason || "").trim().toLowerCase();
  return r === SENDER_NOT_CONNECTED || r.startsWith(`${SENDER_NOT_CONNECTED}:`);
}

export function parseSenderNotConnectedDiagnostic(lastError: string | null | undefined): {
  baseReason: typeof SENDER_NOT_CONNECTED;
  failureClass: ProspectSenderProbeFailureClass | null;
} {
  const raw = String(lastError || "").trim();
  if (!isSenderNotConnectedReason(raw)) {
    return { baseReason: SENDER_NOT_CONNECTED, failureClass: null };
  }
  const parts = raw.split(":");
  const maybeClass = (parts[1] || "").trim().toLowerCase();
  const failureClass = (PROSPECT_SENDER_PROBE_FAILURE_CLASSES as readonly string[]).includes(
    maybeClass,
  )
    ? (maybeClass as ProspectSenderProbeFailureClass)
    : null;
  return { baseReason: SENDER_NOT_CONNECTED, failureClass };
}

/** Persistable lastError / pause reason — UI strips suffix via formatProspectQueueItemError. */
export function formatSenderNotConnectedDiagnostic(
  failureClass: ProspectSenderProbeFailureClass,
): string {
  return `${SENDER_NOT_CONNECTED}:${failureClass}`;
}

export function classifyEmailSenderProbeError(err: unknown): ProspectSenderProbeFailureClass {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err || "");
  const combined = `${name} ${msg}`;

  if (
    name === "EmailCredentialDecryptError" ||
    /could not be decrypted|unable to authenticate data|Unsupported state/i.test(combined)
  ) {
    return "decrypt";
  }
  if (
    /Token refresh failed|Missing refresh token|Mailbox needs reconnect|needs reconnect/i.test(
      combined,
    )
  ) {
    return "token_refresh";
  }
  if (/401|403|unauthorized|invalid_grant|invalid.?token/i.test(combined)) {
    return "api_auth";
  }
  return "other_probe_failure";
}

export function classifyMailboxSyncStatusNotSendable(
  syncStatus: string | null | undefined,
): ProspectSenderProbeFailureClass {
  const s = String(syncStatus || "").toLowerCase();
  if (!s || s === "disconnected") return "mailbox_disconnected";
  return "other_probe_failure";
}

export type ProspectSenderProbeDiagInput = {
  stage: ProspectSenderProbeStage;
  failureClass: ProspectSenderProbeFailureClass;
  workspaceIdPrefix?: string | null;
  mailboxIdPrefix?: string | null;
  queueItemIdPrefix?: string | null;
  contactIdPrefix?: string | null;
  syncStatus?: string | null;
  errName?: string | null;
  /** Safe, truncated message — never tokens */
  errMsgSafe?: string | null;
  preferredMailboxIdPrefix?: string | null;
};

/** Structured log payload for console.info(JSON.stringify(...)). */
export function prospectSenderProbeDiagLog(
  input: ProspectSenderProbeDiagInput,
): Record<string, unknown> {
  return {
    tag: "[ProspectBulkOutreach]",
    event: "sender_probe_failed",
    stage: input.stage,
    failureClass: input.failureClass,
    workspaceIdPrefix: input.workspaceIdPrefix || null,
    mailboxIdPrefix: input.mailboxIdPrefix || null,
    queueItemIdPrefix: input.queueItemIdPrefix || null,
    contactIdPrefix: input.contactIdPrefix || null,
    preferredMailboxIdPrefix: input.preferredMailboxIdPrefix || null,
    syncStatus: input.syncStatus || null,
    errName: input.errName || null,
    errMsgSafe: input.errMsgSafe
      ? String(input.errMsgSafe).replace(/\s+/g, " ").trim().slice(0, 160)
      : null,
  };
}

export function safeProbeErrorMessage(err: unknown, maxLen = 160): string {
  const raw = err instanceof Error ? err.message : String(err || "");
  return raw
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
