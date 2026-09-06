import crypto from "crypto";

/** Constant-time string compare. Different lengths return false without throwing. */
export function timingSafeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(a.length || 1);
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
