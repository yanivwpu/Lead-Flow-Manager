/**
 * Admin-only, read-only Gmail crypto diagnostics.
 * Never returns secrets, tokens, or ciphertext. Never mutates mailbox rows.
 */
import {
  buildEmailCryptoKeyDiagSnapshot,
  probeMailboxTokensDecryptReadOnly,
} from "./credentials";
import { getPrimaryEmailMailbox } from "./mailboxStore";

export type EmailCryptoAdminDiagnostics = {
  nodeEnv: string | null;
  keySource: string | null;
  keyFp8: string | null;
  productionFailClosed: boolean;
  emailEncryptionKeyPresent: boolean;
  processId: string;
  instanceId: string;
  mailboxId: string | null;
  email: string | null;
  accessTokenDecryptable: boolean;
  refreshTokenDecryptable: boolean;
  decryptFailureField: "access_token" | "refresh_token" | null;
};

export async function getEmailCryptoAdminDiagnostics(
  workspaceUserId: string,
): Promise<EmailCryptoAdminDiagnostics> {
  const key = buildEmailCryptoKeyDiagSnapshot();
  const mailbox = await getPrimaryEmailMailbox(workspaceUserId);

  if (!mailbox) {
    return {
      nodeEnv: key.nodeEnv,
      keySource: key.keySource,
      keyFp8: key.keyFp8,
      productionFailClosed: key.productionFailClosed,
      emailEncryptionKeyPresent: key.emailEncryptionKeyPresent,
      processId: key.processId,
      instanceId: key.instanceId,
      mailboxId: null,
      email: null,
      accessTokenDecryptable: false,
      refreshTokenDecryptable: false,
      decryptFailureField: null,
    };
  }

  const probe = probeMailboxTokensDecryptReadOnly({
    accessTokenEncrypted: mailbox.accessTokenEncrypted,
    refreshTokenEncrypted: mailbox.refreshTokenEncrypted,
  });

  return {
    nodeEnv: key.nodeEnv,
    keySource: key.keySource,
    keyFp8: key.keyFp8,
    productionFailClosed: key.productionFailClosed,
    emailEncryptionKeyPresent: key.emailEncryptionKeyPresent,
    processId: key.processId,
    instanceId: key.instanceId,
    mailboxId: mailbox.id,
    email: mailbox.emailAddress,
    accessTokenDecryptable: probe.accessTokenDecryptable,
    refreshTokenDecryptable: probe.refreshTokenDecryptable,
    decryptFailureField: probe.decryptFailureField,
  };
}
