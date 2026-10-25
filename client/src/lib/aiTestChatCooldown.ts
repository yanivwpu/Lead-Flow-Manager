/** Refresh operational diagnostics after a cooldown; never retry a shopping turn
 * or relax the server's provider quota. The caller cancels on close/unmount. */
export function scheduleTestChatCooldownRefresh(
  diagnostics: { inventoryStatus: string; retryAt: number | null },
  refresh: () => void,
): () => void {
  if (diagnostics.inventoryStatus !== "cooldown" || !diagnostics.retryAt) return () => {};
  const timer = setTimeout(refresh, Math.max(1000, diagnostics.retryAt - Date.now() + 100));
  return () => clearTimeout(timer);
}
