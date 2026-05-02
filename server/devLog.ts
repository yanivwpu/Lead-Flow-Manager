/** Logs only outside production — avoids noisy I/O and serialization cost on hot paths. */
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}
