/**
 * Temporary email unread diagnostics — single-line JSON, no bodies/tokens.
 * Search logs for: [EmailUnreadDiag]
 */
export function logEmailUnreadDiag(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      tag: "[EmailUnreadDiag]",
      event,
      ...payload,
      at: new Date().toISOString(),
    }),
  );
}
