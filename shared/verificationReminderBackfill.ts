/**
 * Guarded one-time recovery of verification reminders for three approved
 * legacy website signups. Resolves by exact full user IDs only — never by
 * name, date, or id tail. Profiles are a cross-check, not a lookup key.
 * Default is dry-run.
 */
import {
  shouldSendVerificationReminder,
  type VerificationReminderDecision,
  type VerificationReminderUser,
} from "./verificationReminderEligibility";

export const VERIFICATION_REMINDER_BACKFILL_EXECUTE_ENV =
  "VERIFICATION_REMINDER_BACKFILL_EXECUTE";

export const VERIFICATION_REMINDER_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VerificationReminderRecoveryProfile = {
  key: "fahd_omaiche" | "jarim" | "jailza";
  label: string;
  nameNeedles: readonly string[];
  createdOnUtc: string;
};

/** Cross-check only — never used to look up recipients. */
export const VERIFICATION_REMINDER_RECOVERY_PROFILES: readonly VerificationReminderRecoveryProfile[] =
  [
    {
      key: "fahd_omaiche",
      label: "Fahd omaiche",
      nameNeedles: ["fahd"],
      createdOnUtc: "2026-08-26",
    },
    {
      key: "jarim",
      label: "Jarim",
      nameNeedles: ["jarim"],
      createdOnUtc: "2026-08-21",
    },
    {
      key: "jailza",
      label: "Jailza",
      nameNeedles: ["jailza", "jaliza"],
      createdOnUtc: "2026-08-21",
    },
  ];

/** @deprecated Use VERIFICATION_REMINDER_RECOVERY_PROFILES. */
export const VERIFICATION_REMINDER_BACKFILL_TARGETS = VERIFICATION_REMINDER_RECOVERY_PROFILES;

export type VerificationReminderBackfillRow = VerificationReminderUser & {
  id: string;
};

export type RecoveryIdentityStatus =
  | "matched"
  | "missing"
  | "invalid_id"
  | "identity_changed"
  | "ambiguous";

export type RecoveryAssignment = {
  requestedId: string;
  profile: VerificationReminderRecoveryProfile | null;
  status: RecoveryIdentityStatus;
  user: VerificationReminderBackfillRow | null;
};

export type SanitizedBackfillRecipient = {
  label: string | null;
  key: string | null;
  userId: string;
  emailMasked: string | null;
  createdAtIso: string | null;
  status: RecoveryIdentityStatus;
  eligible: boolean;
  skipReason: string | null;
};

export type SanitizedBackfillSendResult = {
  label: string | null;
  key: string | null;
  userId: string;
  emailMasked: string | null;
  outcome: "sent" | "skipped" | "error" | "dry_run" | "aborted";
  reason: string | null;
};

export type VerificationReminderBackfillCli = {
  execute: boolean;
  userIds: string[];
  errors: string[];
};

export function utcCalendarDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isExactVerificationReminderUserId(id: string | null | undefined): boolean {
  return VERIFICATION_REMINDER_USER_ID_RE.test(String(id || "").trim());
}

export function maskEmailForBackfill(email: string | null | undefined): string | null {
  const trimmed = String(email || "").trim();
  if (!trimmed) return null;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "(invalid)";
  return `${trimmed.slice(0, 1)}***@${trimmed.slice(at + 1)}`;
}

export function nameMatchesBackfillTarget(
  name: string | null | undefined,
  needles: readonly string[],
): boolean {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return false;
  return needles.some((needle) => n.includes(needle.toLowerCase()));
}

export function parseVerificationReminderUserIdArg(arg: string): string | null {
  const trimmed = arg.trim();
  const prefixed = trimmed.match(/^--user-id=(.+)$/i);
  const value = prefixed ? prefixed[1].trim() : trimmed;
  if (!isExactVerificationReminderUserId(value)) return null;
  return value.toLowerCase();
}

export function parseVerificationReminderBackfillCli(
  argv: string[],
): VerificationReminderBackfillCli {
  const errors: string[] = [];
  let execute = false;
  const userIds: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    if (arg === "--dry-run") {
      execute = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") continue;
    if (arg === "--user-id") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        errors.push("exact --user-id=<uuid> is required");
        continue;
      }
      i += 1;
      const id = parseVerificationReminderUserIdArg(next);
      if (!id) {
        errors.push(`Invalid --user-id (exact UUID required): ${next}`);
        continue;
      }
      userIds.push(id);
      continue;
    }
    if (arg.startsWith("--user-id=")) {
      const id = parseVerificationReminderUserIdArg(arg);
      if (!id) {
        errors.push(`Invalid --user-id (exact UUID required): ${arg}`);
        continue;
      }
      userIds.push(id);
      continue;
    }
    if (arg.startsWith("-")) {
      errors.push(`Unknown argument: ${arg}`);
    }
  }

  const uniqueIds = dedupeBackfillSendUserIds(userIds);
  if (uniqueIds.length === 0) {
    errors.push(
      "exact --user-id=<uuid> is required; recovery does not look up by name, date, or id tail",
    );
  }

  return { execute, userIds: uniqueIds, errors };
}

export function verificationReminderBackfillExecuteConfirmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[VERIFICATION_REMINDER_BACKFILL_EXECUTE_ENV] === "1";
}

export function shouldExecuteVerificationReminderBackfill(
  executeFlag: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(executeFlag) && verificationReminderBackfillExecuteConfirmed(env);
}

export function powershellVerificationReminderRecoveryDryRunCommand(userIds: string[]): string {
  const flags = userIds.map((id) => `--user-id=${id}`).join(" ");
  return `npx tsx scripts/send-verification-reminders.ts ${flags}`.trim();
}

export function powershellVerificationReminderRecoveryExecuteCommand(userIds: string[]): string {
  const flags = userIds.map((id) => `--user-id=${id}`).join(" ");
  return `$env:VERIFICATION_REMINDER_BACKFILL_EXECUTE="1"; npx tsx scripts/send-verification-reminders.ts ${flags} --execute`;
}

function matchingProfilesForUser(
  user: VerificationReminderBackfillRow,
  profiles: readonly VerificationReminderRecoveryProfile[],
): VerificationReminderRecoveryProfile[] {
  return profiles.filter(
    (profile) =>
      nameMatchesBackfillTarget(user.name, profile.nameNeedles) &&
      utcCalendarDate(user.createdAt) === profile.createdOnUtc,
  );
}

/**
 * Resolve recovery recipients by exact full user IDs, then cross-check sanitized
 * name, UTC creation date, source, and unverified status.
 */
export function resolveVerificationReminderRecoveryByExactIds(
  requestedIds: string[],
  rows: VerificationReminderBackfillRow[],
  profiles: readonly VerificationReminderRecoveryProfile[] = VERIFICATION_REMINDER_RECOVERY_PROFILES,
): RecoveryAssignment[] {
  const byId = new Map(rows.map((row) => [row.id.toLowerCase(), row]));
  const usedProfileKeys = new Map<string, string>();
  const assignments: RecoveryAssignment[] = [];

  for (const requestedId of requestedIds) {
    if (!isExactVerificationReminderUserId(requestedId)) {
      assignments.push({
        requestedId,
        profile: null,
        status: "invalid_id",
        user: null,
      });
      continue;
    }

    const user = byId.get(requestedId.toLowerCase()) ?? null;
    if (!user) {
      assignments.push({
        requestedId,
        profile: null,
        status: "missing",
        user: null,
      });
      continue;
    }

    const matches = matchingProfilesForUser(user, profiles);
    if (matches.length === 0) {
      assignments.push({
        requestedId,
        profile: null,
        status: "identity_changed",
        user,
      });
      continue;
    }
    if (matches.length > 1) {
      assignments.push({
        requestedId,
        profile: null,
        status: "ambiguous",
        user,
      });
      continue;
    }

    const profile = matches[0];
    const already = usedProfileKeys.get(profile.key);
    if (already && already !== user.id.toLowerCase()) {
      assignments.push({
        requestedId,
        profile,
        status: "ambiguous",
        user,
      });
      continue;
    }
    usedProfileKeys.set(profile.key, user.id.toLowerCase());
    assignments.push({
      requestedId,
      profile,
      status: "matched",
      user,
    });
  }

  return assignments;
}

export const LEGACY_RECOVERY_ELIGIBILITY_OPTIONS = {
  requireRollout: false,
  requireDelay: false,
} as const;

export function sanitizeBackfillRecipient(
  assignment: RecoveryAssignment,
  now: Date,
  lastDeliveryEvent?: string | null,
): SanitizedBackfillRecipient {
  const user = assignment.user;
  let decision: VerificationReminderDecision | null = null;
  if (assignment.status === "matched" && user) {
    decision = shouldSendVerificationReminder(
      user,
      now,
      lastDeliveryEvent,
      LEGACY_RECOVERY_ELIGIBILITY_OPTIONS,
    );
  }
  const skipFromMatch = assignment.status === "matched" ? null : assignment.status;
  return {
    label: assignment.profile?.label ?? null,
    key: assignment.profile?.key ?? null,
    userId: assignment.requestedId,
    emailMasked: user ? maskEmailForBackfill(user.email) : null,
    createdAtIso: user?.createdAt
      ? user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : new Date(user.createdAt).toISOString()
      : null,
    status: assignment.status,
    eligible: Boolean(decision?.send),
    skipReason: decision && !decision.send ? decision.reason : skipFromMatch,
  };
}

export function recoveryAssignmentIsFatal(preview: SanitizedBackfillRecipient): boolean {
  return preview.status !== "matched" || !preview.eligible;
}

export function dedupeBackfillSendUserIds(userIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of userIds) {
    const normalized = String(id || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function sanitizeBackfillSendResult(
  preview: SanitizedBackfillRecipient,
  outcome: SanitizedBackfillSendResult["outcome"],
  reason?: string | null,
): SanitizedBackfillSendResult {
  return {
    label: preview.label,
    key: preview.key,
    userId: preview.userId,
    emailMasked: preview.emailMasked,
    outcome,
    reason: reason ?? preview.skipReason,
  };
}
