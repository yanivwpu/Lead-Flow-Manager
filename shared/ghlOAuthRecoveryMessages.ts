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
      ? "Your CRM connection was recovered and renewed."
      : "Your CRM connection was recovered successfully.";
  }

  switch (input.reasonCategory) {
    case "no_recoverable_install":
      return "No recoverable CRM connection was found.";
    case "invalid_access_token":
      return "Your CRM connection needs to be renewed.";
    case "refresh_failed":
      return "Your CRM connection needs to be renewed.";
    case "ownership_mismatch":
      return "This CRM connection could not be verified for your account.";
    default:
      break;
  }

  if (input.httpStatus === 401 || input.reason === "not_authenticated") {
    return "Your WhachatCRM session expired. Log in again and finish connecting.";
  }
  if (input.reason === "recovery_failed") {
    return "Could not recover your CRM connection. Reconnect CRM to continue.";
  }
  if (input.reason) {
    return "Could not finish your CRM connection. Reconnect CRM to continue.";
  }
  return "Could not finish your CRM connection. Reconnect CRM to continue.";
}

export const CRM_TRY_FULL_OAUTH_CTA = "Reconnect CRM";
