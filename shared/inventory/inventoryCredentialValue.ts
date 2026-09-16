/** Normalize pasted inventory secrets without logging the value. */
export function normalizeInventorySecretValue(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "").trim();
}

export function buildResoBearerAuthorization(token: string): string {
  return `Bearer ${normalizeInventorySecretValue(token)}`;
}
