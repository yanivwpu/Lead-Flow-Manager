/** Default fixed payout (USD) per completed internal task when no per-salesperson override is set. */
export const DEFAULT_SALES_TASK_PAYOUT_DOLLARS = 50;

export type TaskPayoutFields = {
  taskPayoutAmount?: string | null;
};

export function getEffectiveTaskPayoutDollars(sp: TaskPayoutFields | null | undefined): number {
  if (!sp) return DEFAULT_SALES_TASK_PAYOUT_DOLLARS;
  const raw = sp.taskPayoutAmount;
  if (raw == null || raw === "") return DEFAULT_SALES_TASK_PAYOUT_DOLLARS;
  const n = parseFloat(String(raw));
  if (Number.isNaN(n) || n < 0) return DEFAULT_SALES_TASK_PAYOUT_DOLLARS;
  return n;
}
