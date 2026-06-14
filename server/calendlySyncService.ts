import { storage } from "./storage";
import { decryptIntegrationConfig, encryptIntegrationConfig } from "./integrationConfigCrypto";
import {
  calendlyGetCurrentUser,
  calendlyListEventInvitees,
  calendlyListScheduledEvents,
  type CalendlyEventInviteeResource,
  type CalendlyScheduledEventResource,
} from "./calendlyApi";
import { ingestCalendlyEvent } from "./calendlyWebhook";
import { shouldSkipCalendlyPollIngest } from "./appointmentDedup";
import {
  isCalendlyBookingCanceledPayload,
  isCanceledCalendlyStatus,
  normalizeCalendlyStatus,
} from "@shared/calendlyAppointmentDedup";
  calendlySyncModeConfigPatch,
  resolveCalendlySyncModeFromConfig,
  type CalendlySyncMode,
} from "./calendlyBookingConnected";

export const CALENDLY_POLL_LOG = "[CalendlyPoll]";

const DEFAULT_MANUAL_BACKFILL_DAYS = 30;
const DEFAULT_CRON_BACKFILL_DAYS = 14;
const POLL_OVERLAP_MS = 5 * 60 * 1000;

export type CalendlyPollResult = {
  ok: boolean;
  imported: number;
  canceled: number;
  skipped: number;
  eventsScanned: number;
  inviteesScanned: number;
  error?: string;
  lastPollAt: string;
};

function logPoll(event: string, payload: Record<string, unknown>): void {
  console.info(CALENDLY_POLL_LOG, JSON.stringify({ event, ...payload }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function readPollCursor(cfg: Record<string, unknown>): Date | null {
  const raw = cfg.calendlyLastPollAt;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildPollIngestBody(
  scheduledEvent: CalendlyScheduledEventResource,
  invitee: CalendlyEventInviteeResource,
  eventType: "invitee.created" | "invitee.canceled",
): Record<string, unknown> {
  const cancellation = invitee.cancellation;
  const isRescheduleCancellation =
    cancellation?.rescheduled === true ||
    String(cancellation?.reason || "")
      .toLowerCase()
      .includes("reschedul");

  return {
    event: eventType,
    payload: {
      email: invitee.email,
      name: invitee.name,
      first_name: invitee.first_name,
      last_name: invitee.last_name,
      uri: invitee.uri,
      scheduled_event: {
        uri: scheduledEvent.uri,
        name: scheduledEvent.name,
        status: scheduledEvent.status,
        start_time: scheduledEvent.start_time,
        end_time: scheduledEvent.end_time,
        location: scheduledEvent.location,
      },
      tracking: invitee.tracking,
      reschedule_url: invitee.reschedule_url,
      cancellation,
      rescheduled: isRescheduleCancellation,
    },
  };
}

function resolvePollEventType(
  scheduledEvent: CalendlyScheduledEventResource,
  invitee: CalendlyEventInviteeResource,
): "invitee.created" | "invitee.canceled" | null {
  const inviteeStatus = normalizeCalendlyStatus(invitee.status);
  const eventStatus = normalizeCalendlyStatus(scheduledEvent.status);
  if (isCanceledCalendlyStatus(inviteeStatus) || isCanceledCalendlyStatus(eventStatus)) {
    return "invitee.canceled";
  }
  if (invitee.cancellation) {
    const rescheduled =
      invitee.cancellation.rescheduled === true ||
      String(invitee.cancellation.reason || "")
        .toLowerCase()
        .includes("reschedul");
    if (!rescheduled) return "invitee.canceled";
  }
  if (inviteeStatus === "active" || eventStatus === "active" || !inviteeStatus) {
    return "invitee.created";
  }
  return null;
}

async function shouldSkipPollIngest(params: {
  userId: string;
  eventType: "invitee.created" | "invitee.canceled";
  scheduledEventUri?: string;
  inviteeUri?: string;
  email?: string;
  startTimeIso?: string;
  body?: Record<string, unknown>;
}): Promise<boolean> {
  return shouldSkipCalendlyPollIngest({
    userId: params.userId,
    eventType: params.eventType,
    scheduledEventUri: params.scheduledEventUri,
    inviteeUri: params.inviteeUri,
    startTimeIso: params.startTimeIso,
    body: params.body,
  });
}

async function fetchAllScheduledEvents(
  token: string,
  scope: { user?: string; organization?: string },
  minStartTime: string,
  maxStartTime: string,
): Promise<CalendlyScheduledEventResource[]> {
  const all: CalendlyScheduledEventResource[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 50; page++) {
    const res = await calendlyListScheduledEvents(token, {
      ...scope,
      minStartTime,
      maxStartTime,
      count: 100,
      pageToken,
    });

    if (res.status === 429) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) {
      throw new Error(
        (res.data as { message?: string })?.message ||
          (res.data as { title?: string })?.title ||
          "Calendly scheduled_events request failed",
      );
    }

    const batch = res.data?.collection || [];
    all.push(...batch);

    const nextToken = res.data?.pagination?.next_page_token;
    if (!nextToken) break;
    pageToken = nextToken;
    await sleep(150);
  }

  return all;
}

async function fetchAllInvitees(
  token: string,
  scheduledEventUri: string,
): Promise<CalendlyEventInviteeResource[]> {
  const all: CalendlyEventInviteeResource[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page++) {
    const res = await calendlyListEventInvitees(token, scheduledEventUri, pageToken);
    if (res.status === 429) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) break;

    const batch = res.data?.collection || [];
    all.push(...batch);

    const nextToken = res.data?.pagination?.next_page_token;
    if (!nextToken) break;
    pageToken = nextToken;
    await sleep(100);
  }

  return all;
}

export async function pollCalendlyBookingsForUser(
  userId: string,
  opts?: { backfillDays?: number; manual?: boolean },
): Promise<CalendlyPollResult> {
  const startedAt = new Date();
  const result: CalendlyPollResult = {
    ok: false,
    imported: 0,
    canceled: 0,
    skipped: 0,
    eventsScanned: 0,
    inviteesScanned: 0,
    lastPollAt: startedAt.toISOString(),
  };

  const integration = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!integration?.isActive) {
    return { ...result, error: "Calendly integration not active" };
  }

  const cfg = decryptIntegrationConfig((integration.config || {}) as Record<string, unknown>);
  const token = String(cfg.accessToken || "").trim();
  if (!token) {
    return { ...result, error: "Calendly token missing" };
  }

  const syncMode = resolveCalendlySyncModeFromConfig(cfg);
  logPoll("poll_started", { userId, syncMode, manual: !!opts?.manual });

  let userUri = String(cfg.calendlyUserUri || "").trim();
  let orgUri = String(cfg.calendlyOrganizationUri || "").trim();

  if (!userUri || !orgUri) {
    const me = await calendlyGetCurrentUser(token);
    if (me.ok && me.data?.resource) {
      userUri = userUri || String(me.data.resource.uri || "").trim();
      orgUri = orgUri || String(me.data.resource.current_organization || "").trim();
    }
  }

  const backfillDays = opts?.backfillDays ?? (opts?.manual ? DEFAULT_MANUAL_BACKFILL_DAYS : DEFAULT_CRON_BACKFILL_DAYS);
  const lastPoll = readPollCursor(cfg);
  const minStart = opts?.manual
    ? isoDaysAgo(backfillDays)
    : lastPoll
      ? new Date(lastPoll.getTime() - POLL_OVERLAP_MS).toISOString()
      : isoDaysAgo(backfillDays);
  const maxStart = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const scope = userUri ? { user: userUri } : orgUri ? { organization: orgUri } : {};
  if (!scope.user && !scope.organization) {
    return { ...result, error: "Calendly user or organization URI not found" };
  }

  try {
    const events = await fetchAllScheduledEvents(token, scope, minStart, maxStart);
    result.eventsScanned = events.length;

    for (const event of events) {
      if (!event.uri) continue;
      const invitees = await fetchAllInvitees(token, event.uri);
      result.inviteesScanned += invitees.length;

      for (const invitee of invitees) {
        let eventType = resolvePollEventType(event, invitee);
        if (!eventType) {
          result.skipped++;
          continue;
        }

        const scheduledEventUri = event.uri;
        const inviteeUri = invitee.uri;
        let body = buildPollIngestBody(event, invitee, eventType);

        if (eventType === "invitee.created" && isCalendlyBookingCanceledPayload(body)) {
          eventType = "invitee.canceled";
          body = { ...body, event: "invitee.canceled" };
        }

        if (
          await shouldSkipPollIngest({
            userId,
            eventType,
            scheduledEventUri,
            inviteeUri,
            startTimeIso: event.start_time,
            body,
          })
        ) {
          result.skipped++;
          continue;
        }

        try {
          await ingestCalendlyEvent(userId, body, { source: "calendly_poll" });
          if (eventType === "invitee.created") result.imported++;
          else result.canceled++;
          logPoll("invitee_ingested", {
            userId,
            eventType,
            scheduledEventUri: scheduledEventUri?.slice(-24),
            inviteeEmail: invitee.email || null,
          });
        } catch (err) {
          logPoll("invitee_ingest_failed", {
            userId,
            eventType,
            error: err instanceof Error ? err.message : String(err),
          });
          result.skipped++;
        }
      }
    }

    result.ok = true;
    result.lastPollAt = new Date().toISOString();

    await storage.updateIntegration(integration.id, {
      lastSyncAt: new Date(),
      config: encryptIntegrationConfig({
        ...cfg,
        calendlyLastPollAt: result.lastPollAt,
        ...(userUri ? { calendlyUserUri: userUri } : {}),
        ...(orgUri ? { calendlyOrganizationUri: orgUri } : {}),
      }),
    });

    logPoll("poll_complete", { userId, ...result });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logPoll("poll_failed", { userId, error: message });
    return { ...result, error: message };
  }
}

export async function runCalendlyPollingCron(): Promise<void> {
  const integrations = await storage.getIntegrationsByType("calendly");
  for (const row of integrations) {
    if (!row.isActive) continue;
    const cfg = (row.config || {}) as Record<string, unknown>;
    if (resolveCalendlySyncModeFromConfig(cfg) !== "polling") continue;
    try {
      await pollCalendlyBookingsForUser(row.userId, { manual: false });
    } catch (err) {
      console.error(CALENDLY_POLL_LOG, "cron_user_failed", row.userId, err);
    }
  }
}

export { resolveCalendlySyncModeFromConfig, calendlySyncModeConfigPatch, type CalendlySyncMode };
