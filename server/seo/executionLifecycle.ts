export const SEO_SYNC_STATE_TRANSITIONS = [
  ["importing", "finalizing", "import completed or failed"],
  ["finalizing", "finalized", "owner-fenced result persisted"],
  ["finalized", "cleanup", "best-effort lease release; result immutable"],
  ["importing", "aborted", "heartbeat or ownership lost"],
  ["aborted", "finalized", "owner-fenced aborted diagnostic persisted"],
  ["aborted", "abandoned", "fence unavailable; next expired-lease reclaim reconciles"],
] as const;

/** Cleanup is telemetry-only once a business result has been persisted. */
export async function bestEffortExecutionCleanup(cleanup: () => Promise<unknown>, report: (error: unknown) => void = console.error): Promise<boolean> {
  try {
    await cleanup();
    return true;
  } catch (error) {
    report(error);
    return false;
  }
}
