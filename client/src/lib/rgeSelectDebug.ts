/**
 * REMOVEME: Temporary RGE Radix Select diagnostics — delete this file and all
 * `logRgeSelect` imports after one deploy confirms the Select loop is fixed.
 *
 * Search: `RGE_SELECT_DEBUG` | `logRgeSelect` | `rgeSelectDebug`
 */
export const RGE_SELECT_DEBUG = true;

const burstWindowMs = 500;
const burstThreshold = 4;
const burstCounts = new Map<string, { count: number; windowStart: number }>();

export function logRgeSelect(
  component: string,
  fieldName: string,
  serverValue: unknown,
  draftValue: unknown,
  nextValue: unknown,
  action: "change" | "value-prop" | "sync" = "change",
): void {
  if (!RGE_SELECT_DEBUG) return;

  const key = `${component}.${fieldName}`;
  const now = Date.now();
  const prev = burstCounts.get(key);
  const inWindow = prev && now - prev.windowStart < burstWindowMs;
  const count = inWindow ? prev!.count + 1 : 1;
  burstCounts.set(key, { count, windowStart: inWindow ? prev!.windowStart : now });

  console.log(
    "[RGE Select DEBUG]", // REMOVEME
    component,
    fieldName,
    action,
    "server",
    serverValue,
    "draft",
    draftValue,
    "next",
    nextValue,
  );

  if (count >= burstThreshold) {
    console.error(
      "[RGE Select LOOP SUSPECT]", // REMOVEME
      component,
      fieldName,
      `fired ${count} times within ${burstWindowMs}ms`,
      { serverValue, draftValue, nextValue, action },
    );
  }
}
