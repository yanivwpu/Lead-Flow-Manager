/** Positive means ranking improved (a numerically lower average position). */
export function averageSeoPosition(weightedPosition: number, impressions: number): number | null {
  if (!Number.isFinite(weightedPosition) || !Number.isFinite(impressions) || impressions <= 0) return null;
  return weightedPosition / impressions;
}

export function averagePositionImprovementPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((previous - current) / previous) * 100;
}

export function formatSeoPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
