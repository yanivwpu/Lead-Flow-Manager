import {
  getGmailSetupVideoUrl,
  gmailVerificationCancelHelpToast,
  isGmailGoogleVerificationPending,
  shouldShowGmailVerificationCancelHelp,
  shouldShowGmailVerificationGuidance,
} from "@shared/gmailGoogleVerification";

const viteEnv = import.meta.env as Record<string, string | undefined>;

export function readGmailGoogleVerificationPending(): boolean {
  return isGmailGoogleVerificationPending(viteEnv.VITE_GMAIL_GOOGLE_VERIFICATION_PENDING);
}

export function readGmailSetupVideoUrl(): string | null {
  return getGmailSetupVideoUrl(viteEnv.VITE_GMAIL_SETUP_VIDEO_URL);
}

export {
  gmailVerificationCancelHelpToast,
  shouldShowGmailVerificationCancelHelp,
  shouldShowGmailVerificationGuidance,
};
