/**
 * Parse preset template delay strings ("0", "1h", "24h", "12h", "30m", "2d") to milliseconds.
 */
export function parsePresetDelayToMs(raw: string | undefined | null): number {
  const s = String(raw ?? "0").trim().toLowerCase();
  if (!s || s === "0") return 0;

  const withUnit = /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i.exec(s);
  if (withUnit) {
    const n = parseInt(withUnit[1], 10);
    const u = withUnit[2].toLowerCase();
    if (u.startsWith("m")) return n * 60 * 1000;
    if (u.startsWith("h")) return n * 60 * 60 * 1000;
    if (u.startsWith("d")) return n * 24 * 60 * 60 * 1000;
  }

  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return n * 60 * 60 * 1000;
  }

  return 0;
}
