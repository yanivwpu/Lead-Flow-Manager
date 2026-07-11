export type CrmOAuthRecoveryReasonCategory =
  | "no_recoverable_install"
  | "invalid_access_token"
  | "refresh_failed"
  | "ownership_mismatch"
  | "other"
  | string
  | null;

export type CrmOAuthRecoveryDisplayInput = {
  recovered: boolean;
  oauthRequired?: boolean;
  reason?: string | null;
  reasonCategory?: CrmOAuthRecoveryReasonCategory;
  httpStatus?: number;
  refreshed?: boolean;
};

export function humanReadableCrmOAuthRecoveryMessage(input: CrmOAuthRecoveryDisplayInput): string {
  if (input.recovered) {
    return input.refreshed
      ? "Existing OAuth tokens were recovered successfully and the access token was refreshed."
      : "Existing OAuth tokens were recovered successfully.";
  }

  switch (input.reasonCategory) {
    case "no_recoverable_install":
      return "No recoverable OAuth installation was found.";
    case "invalid_access_token":
      return "Stored access token is invalid.";
    case "refresh_failed":
      return "Refresh token failed.";
    case "ownership_mismatch":
      return "Ownership could not be verified.";
    default:
      break;
  }

  if (input.httpStatus === 401 || input.reason === "not_authenticated") {
    return "WhachatCRM session expired. Log in again and retry recovery.";
  }
  if (input.reason === "recovery_failed") {
    return "Server error while recovering OAuth tokens.";
  }
  if (input.reason) {
    return `Recovery failed: ${input.reason}`;
  }
  return "Recovery failed for an unknown reason.";
}

export const CRM_TRY_FULL_OAUTH_CTA = "Try full OAuth authorization";
