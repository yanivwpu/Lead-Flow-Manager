import type { Request, Response } from "express";
import { extractCalendlyBookingPayload, verifyCalendlyWebhookSignature } from "./calendlyWebhook";
import { recordGrowthEngineSessionBooked, type GrowthEngineSessionBookingDetails } from "./growthEngineSetupService";

function readTrackingUserId(tracking: unknown): string | undefined {
  if (!tracking || typeof tracking !== "object") return undefined;
  const t = tracking as Record<string, unknown>;
  const raw = t.utm_content ?? t.utmContent;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function readTrackingFromBody(body: Record<string, unknown>): unknown {
  const payload = (body.payload as Record<string, unknown>) || body;
  const invitee = (payload.invitee as Record<string, unknown>) || payload;
  const scheduled =
    payload.scheduled_event && typeof payload.scheduled_event === "object"
      ? payload.scheduled_event
      : invitee.scheduled_event;
  return (
    payload.tracking ||
    invitee.tracking ||
    (scheduled && typeof scheduled === "object" ? (scheduled as Record<string, unknown>).tracking : undefined)
  );
}

export async function handleGrowthEngineSetupCalendlyWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const sigHeader = req.get("calendly-webhook-signature") || undefined;
  const signingKey =
    String(process.env.CALENDLY_GROWTH_ENGINE_WEBHOOK_SIGNING_KEY || "").trim() ||
    String(process.env.CALENDLY_WEBHOOK_SIGNING_KEY || "").trim();

  if (!signingKey || !rawBody || !sigHeader) {
    if (process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS !== "true") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else if (!verifyCalendlyWebhookSignature(rawBody, sigHeader, signingKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  res.status(200).json({ ok: true });

  setImmediate(() => {
    void processGrowthEngineSetupCalendlyPayload(body).catch((err) => {
      console.error("[GE Setup Calendly] Async processing error:", err);
    });
  });
}

async function processGrowthEngineSetupCalendlyPayload(body: Record<string, unknown>): Promise<void> {
  const event = String(body.event || "");
  if (event !== "invitee.created") return;

  const parsed = extractCalendlyBookingPayload(body);
  if (!parsed) {
    console.warn("[GE Setup Calendly] invitee.created — missing email");
    return;
  }

  const tracking = readTrackingFromBody(body);
  const utmUserId = readTrackingUserId(tracking);

  const details: GrowthEngineSessionBookingDetails = {
    inviteeEmail: parsed.email,
    inviteeName: parsed.name,
    eventTypeName: parsed.eventTypeName,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    scheduledEventUri: parsed.scheduledEventUri,
    inviteeUri: parsed.inviteeUri,
    meetingLink: parsed.meetingLink,
  };

  const result = await recordGrowthEngineSessionBooked({
    userIdHint: utmUserId,
    inviteeEmail: parsed.email,
    details,
  });

  if (result.recorded) {
    console.log("[GE Setup Calendly] Session booked", {
      userId: result.userId,
      taskId: result.taskId,
      email: parsed.email,
    });
  } else {
    console.warn("[GE Setup Calendly] No matching open setup task", {
      email: parsed.email,
      utmUserId: utmUserId || null,
      reason: result.reason,
    });
  }
}
