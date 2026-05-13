import { storage } from "./storage";
import type { GrowthEngineSetupTask } from "@shared/schema";

export const RGE_TEMPLATE_ID = "realtor-growth-engine";

export const GE_SETUP_STATUS = {
  purchased: "purchased",
  onboardingSubmitted: "onboarding_submitted",
  sessionPending: "session_pending",
  sessionBooked: "session_booked",
  setupCompleted: "setup_completed",
} as const;

export type GeSetupStatus = (typeof GE_SETUP_STATUS)[keyof typeof GE_SETUP_STATUS];

export function getDefaultRgeSetupCalendarUrl(): string | null {
  const v = process.env.DEFAULT_RGE_SETUP_CALENDAR_URL?.trim();
  return v || null;
}

/** Next active specialist with role setup|both and fewest open (non-completed) tasks. */
export async function pickNextSetupSpecialistId(): Promise<string | null> {
  const all = await storage.getSalespeople();
  const eligible = all.filter(
    (s) => s.isActive && (s.role === "setup" || s.role === "both"),
  );
  if (eligible.length === 0) return null;

  const openCounts = await Promise.all(
    eligible.map(async (s) => ({
      id: s.id,
      count: await storage.countOpenGrowthEngineSetupTasksForSalesperson(s.id),
    })),
  );
  openCounts.sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
  return openCounts[0]?.id ?? null;
}

export async function ensureGrowthEnginePurchasedTask(userId: string): Promise<GrowthEngineSetupTask | undefined> {
  const existing = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  if (existing) return existing;
  const specialistId = await pickNextSetupSpecialistId();
  try {
    return await storage.insertGrowthEngineSetupTask({
      userId,
      templateId: RGE_TEMPLATE_ID,
      salespersonId: specialistId,
      status: GE_SETUP_STATUS.purchased,
    });
  } catch (e: any) {
    // Unique race: fetch again
    if (String(e?.message || "").includes("unique") || e?.code === "23505") {
      return storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
    }
    throw e;
  }
}

export async function onGrowthEngineSubmissionRecorded(
  userId: string,
  submissionId: string,
): Promise<void> {
  await ensureGrowthEnginePurchasedTask(userId);
  await storage.updateGrowthEngineSetupTaskByUserTemplate(userId, RGE_TEMPLATE_ID, {
    status: GE_SETUP_STATUS.onboardingSubmitted,
    submissionId,
    onboardingSubmittedAt: new Date(),
  });
}

export async function onGrowthEngineInstallSuccess(userId: string): Promise<void> {
  const t = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  if (!t) return;
  if (t.status === GE_SETUP_STATUS.setupCompleted) return;
  await storage.updateGrowthEngineSetupTaskByUserTemplate(userId, RGE_TEMPLATE_ID, {
    status: GE_SETUP_STATUS.sessionPending,
  });
}

export async function resolveConciergeBookingUrlForUser(userId: string): Promise<{
  calendarUrl: string | null;
  source: "specialist" | "default" | "none";
}> {
  const task = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  if (task?.salespersonId) {
    const sp = await storage.getSalesperson(task.salespersonId);
    const link = sp?.calendarLink?.trim();
    if (link) return { calendarUrl: link, source: "specialist" };
  }
  const def = getDefaultRgeSetupCalendarUrl();
  if (def) return { calendarUrl: def, source: "default" };
  return { calendarUrl: null, source: "none" };
}

/** Sync check for admin lists (no per-user DB round trips beyond maps you already have). */
export function isCalendarMissingForSetupTask(
  task: Pick<GrowthEngineSetupTask, "status" | "salespersonId">,
  specialistCalendarLink: string | null | undefined,
): boolean {
  if (
    task.status !== GE_SETUP_STATUS.sessionPending &&
    task.status !== GE_SETUP_STATUS.onboardingSubmitted
  ) {
    return false;
  }
  if (specialistCalendarLink?.trim()) return false;
  return !getDefaultRgeSetupCalendarUrl();
}

export async function adminGrowthEngineCalendarWarning(userId: string): Promise<boolean> {
  const task = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  if (!task) return false;
  let specialistLink: string | null | undefined;
  if (task.salespersonId) {
    const sp = await storage.getSalesperson(task.salespersonId);
    specialistLink = sp?.calendarLink;
  }
  return isCalendarMissingForSetupTask(task, specialistLink);
}
