/**
 * Workspace-specific Calendly event-type selection.
 *
 * A connected Calendly account can expose several active event types. Each WhachatCRM
 * workspace must import and advertise only the event the merchant chose. Isolation is by
 * Calendly event-type URI, never by remembered booking context or UTM parameters.
 */

export type CalendlyEventTypeOption = {
  uri: string;
  name: string;
  slug: string;
  schedulingUrl: string;
  durationMinutes: number | null;
  locationType: string;
};

export type CalendlyEventSelectionResult = {
  selected: CalendlyEventTypeOption | null;
  selectionRequired: boolean;
};

const EVENT_TYPE_URI_RE = /\/event_types\/[A-Za-z0-9_-]+/i;

export function normalizeCalendlyResourceUri(uri: string | null | undefined): string {
  return typeof uri === "string" ? uri.trim().replace(/\/+$/, "") : "";
}

export function isCalendlyEventTypeUri(uri: string | null | undefined): boolean {
  const value = normalizeCalendlyResourceUri(uri);
  return value.startsWith("http") && EVENT_TYPE_URI_RE.test(value);
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function locationTypeFromKind(kind: string): string {
  const key = kind.trim().toLowerCase();
  if (key === "google_conference" || key === "gotomeeting_conference") return "Google Meet";
  if (key === "zoom_conference") return "Zoom";
  if (key === "microsoft_teams_conference") return "Microsoft Teams";
  if (key === "webex_conference") return "Webex";
  if (key === "physical" || key === "inbound_call" || key === "outbound_call") {
    return key === "physical" ? "In person" : "Phone";
  }
  if (key === "ask_invitee") return "Invitee chooses";
  if (key === "custom") return "Custom";
  return kind.replace(/_/g, " ").trim() || "Unspecified";
}

export function mapCalendlyEventTypeCollection(raw: unknown): CalendlyEventTypeOption[] {
  if (!Array.isArray(raw)) return [];
  const out: CalendlyEventTypeOption[] = [];
  for (const row of raw) {
    const rec = readObject(row);
    if (!rec) continue;
    const uri = normalizeCalendlyResourceUri(readString(rec.uri));
    const name = readString(rec.name);
    const schedulingUrl = readString(rec.scheduling_url || rec.schedulingUrl);
    if (!isCalendlyEventTypeUri(uri) || !name || !/^https?:\/\//i.test(schedulingUrl)) continue;
    const locations = Array.isArray(rec.locations) ? rec.locations : [];
    const firstLoc = readObject(locations[0]);
    const durationRaw = rec.duration;
    const durationMinutes =
      typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw > 0
        ? Math.round(durationRaw)
        : null;
    out.push({
      uri,
      name,
      slug: readString(rec.slug),
      schedulingUrl,
      durationMinutes,
      locationType: locationTypeFromKind(readString(firstLoc?.kind) || "unspecified"),
    });
  }
  return out;
}

export function resolveCalendlyEventSelection(
  types: CalendlyEventTypeOption[],
  requestedUri?: string | null,
  existingUri?: string | null,
): CalendlyEventSelectionResult {
  const requested = normalizeCalendlyResourceUri(requestedUri);
  const existing = normalizeCalendlyResourceUri(existingUri);
  const byUri = (uri: string) => types.find((t) => normalizeCalendlyResourceUri(t.uri) === uri) || null;

  if (requested) {
    const match = byUri(requested);
    if (match) return { selected: match, selectionRequired: false };
  }
  if (existing) {
    const match = byUri(existing);
    if (match) return { selected: match, selectionRequired: false };
  }
  if (types.length === 1) {
    return { selected: types[0], selectionRequired: false };
  }
  if (types.length > 1) {
    return { selected: null, selectionRequired: true };
  }
  return { selected: null, selectionRequired: false };
}

export function calendlySelectionConfigPatch(result: CalendlyEventSelectionResult): Record<string, unknown> {
  if (!result.selected) {
    return {
      calendlyEventSelectionRequired: result.selectionRequired,
      ...(result.selectionRequired
        ? {
            calendlySelectedEventTypeUri: "",
            calendlySelectedEventTypeName: "",
            calendlySelectedEventSchedulingUrl: "",
          }
        : {}),
    };
  }
  return {
    calendlySelectedEventTypeUri: result.selected.uri,
    calendlySelectedEventTypeName: result.selected.name,
    calendlySelectedEventSchedulingUrl: result.selected.schedulingUrl,
    calendlySelectedEventDurationMinutes: result.selected.durationMinutes,
    calendlySelectedEventLocationType: result.selected.locationType,
    calendlyPrimarySchedulingUrl: result.selected.schedulingUrl,
    calendlyPrimaryEventTypeName: result.selected.name,
    calendlyEventSelectionRequired: false,
  };
}

export function selectedCalendlyEventTypeUri(cfg: Record<string, unknown> | null | undefined): string {
  if (!cfg) return "";
  return normalizeCalendlyResourceUri(readString(cfg.calendlySelectedEventTypeUri));
}

export function calendlyBookingSyncEnabled(cfg: Record<string, unknown> | null | undefined): boolean {
  if (!cfg) return false;
  if (cfg.calendlyEventSelectionRequired === true) return false;
  return isCalendlyEventTypeUri(selectedCalendlyEventTypeUri(cfg));
}

export function calendlyEventTypeMatchesWorkspace(
  cfg: Record<string, unknown> | null | undefined,
  eventTypeUri: string | null | undefined,
): boolean {
  if (!calendlyBookingSyncEnabled(cfg)) return false;
  const selected = selectedCalendlyEventTypeUri(cfg);
  const incoming = normalizeCalendlyResourceUri(eventTypeUri);
  return Boolean(selected && incoming && selected === incoming);
}

export function extractCalendlyEventTypeUri(body: unknown, scheduledEvent?: unknown): string {
  const root = readObject(body) || {};
  const payload = readObject(root.payload) || root;
  const scheduled =
    readObject(scheduledEvent) ||
    readObject(payload.scheduled_event) ||
    readObject(payload.event) ||
    {};

  const candidates: unknown[] = [
    scheduled.event_type,
    payload.event_type,
    root.event_type,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isCalendlyEventTypeUri(candidate)) {
      return normalizeCalendlyResourceUri(candidate);
    }
    const obj = readObject(candidate);
    if (obj && isCalendlyEventTypeUri(readString(obj.uri))) {
      return normalizeCalendlyResourceUri(readString(obj.uri));
    }
  }
  return "";
}

export function shouldIngestCalendlyPayloadForWorkspace(
  cfg: Record<string, unknown> | null | undefined,
  body: unknown,
  scheduledEvent?: unknown,
): { ok: boolean; reason: string; eventTypeUri: string } {
  const eventTypeUri = extractCalendlyEventTypeUri(body, scheduledEvent);
  if (!calendlyBookingSyncEnabled(cfg)) {
    return { ok: false, reason: "event_selection_required", eventTypeUri };
  }
  if (!eventTypeUri) {
    return { ok: false, reason: "missing_event_type_uri", eventTypeUri };
  }
  if (!calendlyEventTypeMatchesWorkspace(cfg, eventTypeUri)) {
    return { ok: false, reason: "event_type_mismatch", eventTypeUri };
  }
  return { ok: true, reason: "matched", eventTypeUri };
}

export function filterScheduledEventsBySelectedType<T extends { event_type?: unknown; uri?: string }>(
  events: T[],
  cfg: Record<string, unknown> | null | undefined,
): T[] {
  if (!calendlyBookingSyncEnabled(cfg)) return [];
  const selected = selectedCalendlyEventTypeUri(cfg);
  return events.filter((event) => {
    const uri =
      typeof event.event_type === "string"
        ? normalizeCalendlyResourceUri(event.event_type)
        : extractCalendlyEventTypeUri({ scheduled_event: event }, event);
    return uri === selected;
  });
}

export function resolveCalendlyCustomerSchedulingUrlFromConfig(
  cfg: Record<string, unknown> | null | undefined,
): string {
  if (!cfg) return "";
  if (cfg.calendlyEventSelectionRequired === true) return "";
  const selected = readString(cfg.calendlySelectedEventSchedulingUrl);
  if (/^https?:\/\//i.test(selected)) return selected;
  if (calendlyBookingSyncEnabled(cfg)) {
    const primary = readString(cfg.calendlyPrimarySchedulingUrl);
    if (/^https?:\/\//i.test(primary)) return primary;
  }
  return "";
}

export function jsonContainsAnySecret(value: unknown, secrets: string[]): boolean {
  const blob = JSON.stringify(value ?? {});
  return secrets.some((secret) => Boolean(secret) && blob.includes(secret));
}

export function publicCalendlyEventTypes(types: CalendlyEventTypeOption[]): CalendlyEventTypeOption[] {
  return types.map((type) => ({
    uri: type.uri,
    name: type.name,
    slug: type.slug,
    schedulingUrl: type.schedulingUrl,
    durationMinutes: type.durationMinutes,
    locationType: type.locationType,
  }));
}
