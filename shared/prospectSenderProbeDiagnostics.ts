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

export const PROSPECT_SENDER_PROBE_DECRYPT_FIELDS = ["access_token", "refresh_token"] as const;
export type ProspectSenderProbeDecryptField =
  (typeof PROSPECT_SENDER_PROBE_DECRYPT_FIELDS)[number];

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
  decryptField: ProspectSenderProbeDecryptField | null;
} {
  const raw = String(lastError || "").trim();
  if (!isSenderNotConnectedReason(raw)) {
    return { baseReason: SENDER_NOT_CONNECTED, failureClass: null, decryptField: null };
  }
  const parts = raw.split(":");
  const maybeClass = (parts[1] || "").trim().toLowerCase();
  const failureClass = (PROSPECT_SENDER_PROBE_FAILURE_CLASSES as readonly string[]).includes(
    maybeClass,
  )
    ? (maybeClass as ProspectSenderProbeFailureClass)
    : null;
  const maybeField = (parts[2] || "").trim().toLowerCase();
  const decryptField = (PROSPECT_SENDER_PROBE_DECRYPT_FIELDS as readonly string[]).includes(
    maybeField,
  )
    ? (maybeField as ProspectSenderProbeDecryptField)
    : null;
  return { baseReason: SENDER_NOT_CONNECTED, failureClass, decryptField };
}

/** Persistable lastError / pause reason — UI strips suffix via formatProspectQueueItemError. */
export function formatSenderNotConnectedDiagnostic(
  failureClass: ProspectSenderProbeFailureClass,
  decryptField?: ProspectSenderProbeDecryptField | null,
): string {
  if (failureClass === "decrypt" && decryptField) {
    return `${SENDER_NOT_CONNECTED}:${failureClass}:${decryptField}`;
  }
  if (failureClass === "decrypt") {
    return `${SENDER_NOT_CONNECTED}:decrypt:access_token`;
  }
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

export function extractDecryptFieldFromError(
  err: unknown,
): ProspectSenderProbeDecryptField | null {
  if (err && typeof err === "object" && "field" in err) {
    const field = String((err as { field?: string }).field || "").toLowerCase();
    if ((PROSPECT_SENDER_PROBE_DECRYPT_FIELDS as readonly string[]).includes(field)) {
      return field as ProspectSenderProbeDecryptField;
    }
  }
  return null;
}

/**
 * One safe in-process re-probe decision for decrypt-only infra pauses.
 * Does not implement the probe — caller supplies reprobe().
 */
export async function decideSenderDecryptInfraPause(params: {
  failureClass: ProspectSenderProbeFailureClass;
  decryptField?: ProspectSenderProbeDecryptField | null;
  mailboxId?: string | null;
  reprobe: (mailboxId: string) => Promise<void>;
}): Promise<{ pause: boolean; recovered: boolean; persistReason: string }> {
  const field =
    params.failureClass === "decrypt"
      ? params.decryptField || ("access_token" as const)
      : null;
  const persistReason = formatSenderNotConnectedDiagnostic(params.failureClass, field);

  if (params.failureClass !== "decrypt" || !params.mailboxId) {
    return { pause: true, recovered: false, persistReason };
  }

  try {
    await params.reprobe(params.mailboxId);
    return { pause: false, recovered: true, persistReason };
  } catch {
    return {
      pause: true,
      recovered: false,
      persistReason: formatSenderNotConnectedDiagnostic("decrypt", field || "access_token"),
    };
  }
}

export type ProspectSenderProbeDiagInput = {
  stage: ProspectSenderProbeStage;
  failureClass: ProspectSenderProbeFailureClass;
  decryptField?: ProspectSenderProbeDecryptField | null;
  workspaceIdPrefix?: string | null;
  mailboxIdPrefix?: string | null;
  queueItemIdPrefix?: string | null;
  contactIdPrefix?: string | null;
  syncStatus?: string | null;
  errName?: string | null;
  /** Safe, truncated message — never tokens */
  errMsgSafe?: string | null;
  preferredMailboxIdPrefix?: string | null;
  recoveredAfterReprobe?: boolean;
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
    decryptField: input.decryptField || null,
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
    recoveredAfterReprobe: input.recoveredAfterReprobe ?? null,
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
