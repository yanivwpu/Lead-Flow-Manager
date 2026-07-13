import type {
  EmailProviderId,
  NormalizedEmailMessage,
  EmailRichSendPayload,
} from "@shared/emailChannel";

export type EmailMailboxTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
};

export type EmailMailboxProfile = {
  emailAddress: string;
  displayName: string | null;
  providerAccountId: string | null;
};

export type EmailSendResult = {
  success: boolean;
  providerMessageId?: string;
  providerThreadId?: string;
  rfcMessageId?: string;
  error?: string;
};

export type EmailSyncPageResult = {
  messages: NormalizedEmailMessage[];
  nextPageToken?: string | null;
  historyId?: string | null;
};

export type EmailHistoryResult = {
  messageIds: string[];
  historyId: string | null;
  /** True when historyId is invalid and a bounded re-sync is required. */
  needsBoundedResync: boolean;
};

export type GmailWatchResult = {
  historyId: string;
  expiration: Date;
};

export interface EmailProvider {
  readonly id: EmailProviderId;

  getAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
    codeChallenge?: string;
  }): string;

  exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<EmailMailboxTokens & EmailMailboxProfile>;

  refreshAccessToken(refreshToken: string): Promise<EmailMailboxTokens>;

  getMailboxProfile(
    accessToken: string,
    opts?: { grantedScopes?: string | null; hasRefreshToken?: boolean },
  ): Promise<EmailMailboxProfile>;

  /** List recent messages for initial sync (Inbox + Sent). */
  listRecentMessages(params: {
    accessToken: string;
    afterDate: Date | null;
    pageToken?: string | null;
    maxResults?: number;
  }): Promise<EmailSyncPageResult>;

  getMessage(accessToken: string, providerMessageId: string): Promise<NormalizedEmailMessage | null>;

  historyList(params: {
    accessToken: string;
    startHistoryId: string;
  }): Promise<EmailHistoryResult>;

  /** Gmail users.watch — optional; only Gmail implements. */
  watchMailbox?(params: {
    accessToken: string;
    topicName: string;
    labelIds?: string[];
  }): Promise<GmailWatchResult>;

  stopWatch?(params: { accessToken: string }): Promise<void>;

  sendNewEmail(params: {
    accessToken: string;
    from: string;
    payload: EmailRichSendPayload;
    textBody: string;
    htmlBody?: string | null;
  }): Promise<EmailSendResult>;

  replyToThread(params: {
    accessToken: string;
    from: string;
    threadId: string;
    payload: EmailRichSendPayload;
    textBody: string;
    htmlBody?: string | null;
  }): Promise<EmailSendResult>;
}
