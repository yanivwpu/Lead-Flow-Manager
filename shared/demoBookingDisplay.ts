import { isDemoAwaitingSchedule } from "./salesCompensation";

export function formatDemoScheduledDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** Never invents a datetime for unscheduled assigned requests. */
export function formatDemoScheduleDisplay(
  value: string | Date | null | undefined,
  status?: string | null,
): string {
  if (status && isDemoAwaitingSchedule(status)) return "Not scheduled yet";
  return formatDemoScheduledDate(value);
}
