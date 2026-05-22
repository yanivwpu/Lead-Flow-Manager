import { RGE_TEMPLATE_ID, RGE_TEMPLATE_ONBOARDING_PATH } from "@shared/rgePaths";
import { storage } from "./storage";
import type { GrowthEngineSetupTask, User } from "@shared/schema";
import { sendGrowthEngineSessionBookedEmail } from "./email";
import { isUserWhatsAppConnectedForActivation } from "./whatsappService";
import { getAppOrigin } from "./urlOrigins";

export { RGE_TEMPLATE_ID };

export const RGE_SETUP_TASK_LOG = "[RGE Setup Task]";

export function logRgeSetupTask(event: string, payload: Record<string, unknown>): void {
  console.warn(RGE_SETUP_TASK_LOG, event, payload);
}

export const GE_SETUP_STATUS = {
  purchased: "purchased",
  onboardingSubmitted: "onboarding_submitted",
  sessionPending: "session_pending",
  sessionBooked: "session_booked",
  setupCompleted: "setup_completed",
} as const;

export type GeSetupStatus = (typeof GE_SETUP_STATUS)[keyof typeof GE_SETUP_STATUS];

const OPEN_GE_SETUP_STATUSES = [
  GE_SETUP_STATUS.purchased,
  GE_SETUP_STATUS.onboardingSubmitted,
  GE_SETUP_STATUS.sessionPending,
] as const;

export type GrowthEngineSessionBookingDetails = {
  inviteeEmail: string;
  inviteeName: string;
  eventTypeName: string;
  startTime?: string;
  endTime?: string;
  scheduledEventUri?: string;
  inviteeUri?: string;
  meetingLink?: string;
};

export type GrowthEngineSessionBookingMeta = GrowthEngineSessionBookingDetails & {
  recordedAt: string;
};

export function buildRgeSetupBookingReturnUrl(): string {
  const base = getAppOrigin().replace(/\/+$/, "");
  return `${base}${RGE_TEMPLATE_ONBOARDING_PATH}?step=4&booking=success`;
}

export function appendGrowthEngineSetupTrackingParams(
  schedulingUrl: string,
  userId: string,
  options?: { redirectAfterBooking?: string },
): string {
  const raw = (schedulingUrl || "").trim();
  if (!raw || !userId) return raw;
  try {
    const url =
      raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw) : new URL(`https://${raw}`);
    url.searchParams.set("utm_source", "whachatcrm");
    url.searchParams.set("utm_medium", "rge_setup");
    url.searchParams.set("utm_content", userId);
    const redirect = options?.redirectAfterBooking?.trim();
    if (redirect) {
      url.searchParams.set("redirect_url", redirect);
    }
    return url.toString();
  } catch {
    const join = raw.includes("?") ? "&" : "?";
    let out = `${raw}${join}utm_source=whachatcrm&utm_medium=rge_setup&utm_content=${encodeURIComponent(userId)}`;
    const redirect = options?.redirectAfterBooking?.trim();
    if (redirect) {
      out += `&redirect_url=${encodeURIComponent(redirect)}`;
    }
    return out;
  }
}

export type RgeSetupTaskMeta = {
  kind: "rge_setup_meta";
  onboarding?: Record<string, unknown>;
  booking?: GrowthEngineSessionBookingMeta;
  updatedAt: string;
};

export function readRgeSetupTaskMeta(internalNotes: string | null | undefined): RgeSetupTaskMeta | null {
  if (!internalNotes?.trim()) return null;
  try {
    const parsed = JSON.parse(internalNotes) as Record<string, unknown>;
    if (parsed?.kind === "rge_setup_meta") {
      return parsed as RgeSetupTaskMeta;
    }
    if (parsed?.kind === "session_booking") {
      const booking = parsed.booking as GrowthEngineSessionBookingMeta | undefined;
      return {
        kind: "rge_setup_meta",
        booking: booking && typeof booking === "object" ? booking : undefined,
        updatedAt: new Date().toISOString(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function writeRgeSetupTaskMeta(parts: {
  onboarding?: Record<string, unknown>;
  booking?: GrowthEngineSessionBookingMeta | null;
  existingNotes?: string | null;
}): string {
  const prior = readRgeSetupTaskMeta(parts.existingNotes ?? null);
  const meta: RgeSetupTaskMeta = {
    kind: "rge_setup_meta",
    onboarding: parts.onboarding ?? prior?.onboarding,
    booking: parts.booking ?? prior?.booking ?? undefined,
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(meta);
}

export function parseGrowthEngineSessionBookingMeta(
  internalNotes: string | null | undefined,
): GrowthEngineSessionBookingMeta | null {
  const meta = readRgeSetupTaskMeta(internalNotes);
  return meta?.booking ?? null;
}

function buildSessionBookingNotes(
  details: GrowthEngineSessionBookingDetails,
  existingNotes?: string | null,
): string {
  const booking: GrowthEngineSessionBookingMeta = {
    ...details,
    recordedAt: new Date().toISOString(),
  };
  return writeRgeSetupTaskMeta({ booking, existingNotes });
}

export async function recordGrowthEngineSessionBooked(params: {
  userIdHint?: string;
  inviteeEmail: string;
  details: GrowthEngineSessionBookingDetails;
}): Promise<{ recorded: boolean; userId?: string; taskId?: string; reason?: string }> {
  let user: User | undefined;

  if (params.userIdHint) {
    user = await storage.getUser(params.userIdHint);
  }
  if (!user && params.inviteeEmail) {
    user = await storage.getUserByEmail(params.inviteeEmail.trim().toLowerCase());
  }
  if (!user) {
    return { recorded: false, reason: "user_not_found" };
  }

  let task = await storage.getGrowthEngineSetupTask(user.id, RGE_TEMPLATE_ID);
  if (!task) {
    task = await ensureGrowthEnginePurchasedTask(user.id);
  }
  if (!task) {
    return { recorded: false, reason: "no_setup_task", userId: user.id };
  }

  if (task.status === GE_SETUP_STATUS.setupCompleted) {
    return { recorded: false, reason: "already_completed", userId: user.id, taskId: task.id };
  }

  const existingMeta = parseGrowthEngineSessionBookingMeta(task.internalNotes);
  const dedupeKey = params.details.scheduledEventUri?.trim();
  if (
    task.status === GE_SETUP_STATUS.sessionBooked &&
    dedupeKey &&
    existingMeta?.scheduledEventUri === dedupeKey
  ) {
    return { recorded: true, userId: user.id, taskId: task.id, reason: "duplicate" };
  }

  if (!OPEN_GE_SETUP_STATUSES.includes(task.status as (typeof OPEN_GE_SETUP_STATUSES)[number]) && task.status !== GE_SETUP_STATUS.sessionBooked) {
    return { recorded: false, reason: "invalid_status", userId: user.id, taskId: task.id };
  }

  const sessionBookedAt = new Date();
  await storage.updateGrowthEngineSetupTask(task.id, {
    status: GE_SETUP_STATUS.sessionBooked,
    sessionBookedAt,
    internalNotes: buildSessionBookingNotes(params.details, task.internalNotes),
  });

  logRgeSetupTask("bookingDetected", {
    userId: user.id,
    taskId: task.id,
    salespersonId: task.salespersonId,
    eventTypeName: params.details.eventTypeName,
    startTime: params.details.startTime,
  });

  let salespersonEmail: string | null = null;
  let salespersonName = "Setup specialist";
  if (task.salespersonId) {
    const sp = await storage.getSalesperson(task.salespersonId);
    if (sp?.email) {
      salespersonEmail = sp.email;
      salespersonName = sp.name || salespersonName;
    }
  }

  if (salespersonEmail) {
    sendGrowthEngineSessionBookedEmail(salespersonEmail, salespersonName, {
      customerName: user.name || params.details.inviteeName,
      customerEmail: user.email || params.details.inviteeEmail,
      eventTypeName: params.details.eventTypeName,
      startTime: params.details.startTime,
      meetingLink: params.details.meetingLink,
    }).catch((err) => console.error("[GE Setup] Salesperson booking email failed:", err));
  }

  return { recorded: true, userId: user.id, taskId: task.id };
}

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

async function assignGrowthEngineSetupSpecialist(
  task: GrowthEngineSetupTask,
): Promise<GrowthEngineSetupTask> {
  if (task.salespersonId) return task;
  const specialistId = await pickNextSetupSpecialistId();
  if (!specialistId) {
    logRgeSetupTask("assign_skipped_no_specialist", {
      userId: task.userId,
      taskId: task.id,
    });
    return task;
  }
  const updated = await storage.updateGrowthEngineSetupTask(task.id, {
    salespersonId: specialistId,
  });
  logRgeSetupTask("assigned", {
    userId: task.userId,
    taskId: task.id,
    salespersonId: specialistId,
  });
  return updated ?? task;
}

async function logSetupTaskPortalVisibility(task: GrowthEngineSetupTask): Promise<void> {
  if (!task.salespersonId) {
    logRgeSetupTask("taskVisibleInPortal", {
      userId: task.userId,
      taskId: task.id,
      visible: false,
      reason: "no_salesperson_assigned",
    });
    return;
  }
  const sp = await storage.getSalesperson(task.salespersonId);
  const role = sp?.role || "sales";
  const visible = !!sp?.isActive && (role === "setup" || role === "both");
  logRgeSetupTask("taskVisibleInPortal", {
    userId: task.userId,
    taskId: task.id,
    salespersonId: task.salespersonId,
    salespersonRole: role,
    visible,
  });
}

export async function ensureGrowthEnginePurchasedTask(userId: string): Promise<GrowthEngineSetupTask | undefined> {
  const existing = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  if (existing) {
    const assigned = await assignGrowthEngineSetupSpecialist(existing);
    return assigned;
  }
  const specialistId = await pickNextSetupSpecialistId();
  try {
    const created = await storage.insertGrowthEngineSetupTask({
      userId,
      templateId: RGE_TEMPLATE_ID,
      salespersonId: specialistId,
      status: GE_SETUP_STATUS.purchased,
    });
    logRgeSetupTask("created", {
      userId,
      taskId: created.id,
      salespersonId: specialistId,
    });
    const assigned = await assignGrowthEngineSetupSpecialist(created);
    await logSetupTaskPortalVisibility(assigned);
    return assigned;
  } catch (e: any) {
    // Unique race: fetch again
    if (String(e?.message || "").includes("unique") || e?.code === "23505") {
      const raced = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
      return raced ? assignGrowthEngineSetupSpecialist(raced) : undefined;
    }
    throw e;
  }
}

export async function onGrowthEngineSubmissionRecorded(
  userId: string,
  submissionId: string,
  onboardingPayload?: Record<string, unknown>,
): Promise<void> {
  let task = await ensureGrowthEnginePurchasedTask(userId);
  if (!task) {
    logRgeSetupTask("submit_skipped_no_task", { userId, submissionId });
    return;
  }
  task = await assignGrowthEngineSetupSpecialist(task);

  const keepSessionBooked = task.status === GE_SETUP_STATUS.sessionBooked;
  const nextStatus = keepSessionBooked
    ? GE_SETUP_STATUS.sessionBooked
    : GE_SETUP_STATUS.onboardingSubmitted;

  const internalNotes = writeRgeSetupTaskMeta({
    onboarding: onboardingPayload,
    booking: parseGrowthEngineSessionBookingMeta(task.internalNotes),
    existingNotes: task.internalNotes,
  });

  const updated = await storage.updateGrowthEngineSetupTaskByUserTemplate(userId, RGE_TEMPLATE_ID, {
    status: nextStatus,
    submissionId,
    onboardingSubmittedAt: new Date(),
    internalNotes,
  });

  if (updated) {
    logRgeSetupTask("onboarding_submitted", {
      userId,
      taskId: updated.id,
      submissionId,
      status: updated.status,
      salespersonId: updated.salespersonId,
      bookingDetected: keepSessionBooked || !!parseGrowthEngineSessionBookingMeta(updated.internalNotes),
    });
    await logSetupTaskPortalVisibility(updated);
  }
}

export async function onGrowthEngineInstallSuccess(userId: string): Promise<void> {
  const t = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  if (!t) return;
  if (t.status === GE_SETUP_STATUS.setupCompleted) return;
  if (t.status === GE_SETUP_STATUS.sessionBooked) return;
  if (t.status !== GE_SETUP_STATUS.onboardingSubmitted) return;
  await storage.updateGrowthEngineSetupTaskByUserTemplate(userId, RGE_TEMPLATE_ID, {
    status: GE_SETUP_STATUS.sessionPending,
  });
}

export async function resolveConciergeBookingUrlForUser(userId: string): Promise<{
  calendarUrl: string | null;
  source: "specialist" | "default" | "none";
}> {
  const returnAfterBooking = buildRgeSetupBookingReturnUrl();
  const task = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  if (task?.salespersonId) {
    const sp = await storage.getSalesperson(task.salespersonId);
    const link = sp?.calendarLink?.trim();
    if (link) {
      return {
        calendarUrl: appendGrowthEngineSetupTrackingParams(link, userId, {
          redirectAfterBooking: returnAfterBooking,
        }),
        source: "specialist",
      };
    }
  }
  const def = getDefaultRgeSetupCalendarUrl();
  if (def) {
    return {
      calendarUrl: appendGrowthEngineSetupTrackingParams(def, userId, {
        redirectAfterBooking: returnAfterBooking,
      }),
      source: "default",
    };
  }
  return { calendarUrl: null, source: "none" };
}

/** Context for support onboarding summary email (embedded signup / guided launch). */
export async function buildGrowthEngineOnboardingEmailContext(userId: string): Promise<{
  whatsappConnected: boolean;
  whatsappLine: string;
  connectedChannels: string[];
  assignedSpecialistName: string | null;
  assignedSpecialistEmail: string | null;
  sessionBooking: GrowthEngineSessionBookingMeta | null;
  onboardingCompletedAt: string | null;
}> {
  const user = await storage.getUser(userId);
  const whatsappConnected = await isUserWhatsAppConnectedForActivation(userId);
  const waLine =
    user?.metaDisplayPhoneNumber ||
    user?.twilioWhatsappNumber ||
    (whatsappConnected ? "Connected via embedded signup" : "Not connected");

  const channelRows = await storage.getChannelSettings(userId);
  const channelLabels: Record<string, string> = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    instagram: "Instagram",
    calendly: "Calendly",
    webchat: "Website chat",
    telegram: "Telegram",
    sms: "SMS",
  };
  const connectedChannels = channelRows
    .filter((c) => c.isConnected)
    .map((c) => channelLabels[c.channel] || c.channel);

  const task = await storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID);
  let assignedSpecialistName: string | null = null;
  let assignedSpecialistEmail: string | null = null;
  if (task?.salespersonId) {
    const sp = await storage.getSalesperson(task.salespersonId);
    assignedSpecialistName = sp?.name || null;
    assignedSpecialistEmail = sp?.email || null;
  }

  const submission = await storage.getRealtorOnboardingSubmission(userId);
  const sessionBooking = parseGrowthEngineSessionBookingMeta(task?.internalNotes);

  return {
    whatsappConnected,
    whatsappLine: waLine,
    connectedChannels,
    assignedSpecialistName,
    assignedSpecialistEmail,
    sessionBooking,
    onboardingCompletedAt: submission?.submittedAt
      ? new Date(submission.submittedAt).toISOString()
      : task?.onboardingSubmittedAt
        ? new Date(task.onboardingSubmittedAt).toISOString()
        : null,
  };
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
