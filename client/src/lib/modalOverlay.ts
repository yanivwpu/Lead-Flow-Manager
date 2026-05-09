import { cn } from "@/lib/utils";

/**
 * App-wide modal backdrop: soft translucent dim + light blur (unified SaaS-style).
 * Use `MODAL_OVERLAY_BACKDROP` for custom full-screen shells; use `MODAL_OVERLAY_CLASSNAME`
 * for Radix Dialog / Sheet / AlertDialog overlay primitives.
 */
export const MODAL_OVERLAY_BACKDROP =
  "bg-slate-950/40 backdrop-blur-[2px]";

/** Full-screen overlay for Dialog, Sheet, AlertDialog — includes Radix open/close fade. */
export const MODAL_OVERLAY_CLASSNAME = cn(
  "fixed inset-0 z-50",
  MODAL_OVERLAY_BACKDROP,
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
);
