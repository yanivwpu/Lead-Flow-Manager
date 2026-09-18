/** Positive means ranking improved (a numerically lower average position). */
export function averagePositionImprovementPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((previous - current) / previous) * 100;
}

export function formatSeoPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
