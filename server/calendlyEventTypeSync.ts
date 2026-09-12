import {
  calendlyGetCurrentUser,
  calendlyListEventTypes,
} from "./calendlyApi";
import {
  calendlyBookingSyncEnabled,
  calendlySelectionConfigPatch,
  mapCalendlyEventTypeCollection,
  publicCalendlyEventTypes,
  resolveCalendlyEventSelection,
  selectedCalendlyEventTypeUri,
  type CalendlyEventTypeOption,
} from "@shared/calendlyEventSelection";

export async function loadActiveCalendlyEventTypes(
  token: string,
  scope: { user?: string; organization?: string },
): Promise<{ ok: boolean; status: number; types: CalendlyEventTypeOption[] }> {
  const listed = await calendlyListEventTypes(token, {
    ...(scope.user ? { user: scope.user } : {}),
    ...(scope.organization ? { organization: scope.organization } : {}),
  });
  return {
    ok: listed.ok,
    status: listed.status,
    types: listed.ok ? mapCalendlyEventTypeCollection(listed.data?.collection) : [],
  };
}

export async function loadCalendlyEventTypesForIntegration(
  token: string,
  cfg: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; types: CalendlyEventTypeOption[] }> {
  const user = String(cfg.calendlyUserUri || "").trim();
  const organization = String(cfg.calendlyOrganizationUri || "").trim();
  if (user || organization) {
    const listed = await loadActiveCalendlyEventTypes(token, {
      ...(user ? { user } : {}),
      ...(organization ? { organization } : {}),
    });
    if (listed.ok) return listed;
  }
  const previewed = await previewCalendlyEventTypes(token);
  if (!previewed.ok) {
    return { ok: false, status: previewed.status, types: [] };
  }
  return { ok: true, status: 200, types: previewed.types };
}

export function applyCalendlyEventSelection(
  cfg: Record<string, unknown>,
  types: CalendlyEventTypeOption[],
  requestedUri?: string | null,
): { cfg: Record<string, unknown>; types: CalendlyEventTypeOption[]; selectionRequired: boolean } {
  const resolved = resolveCalendlyEventSelection(
    types,
    requestedUri,
    selectedCalendlyEventTypeUri(cfg),
  );
  const patch = calendlySelectionConfigPatch(resolved);
  return {
    cfg: { ...cfg, ...patch },
    types: publicCalendlyEventTypes(types),
    selectionRequired: resolved.selectionRequired,
  };
}

export type CalendlyEventTypePreviewResult =
  | {
      ok: true;
      status: number;
      types: CalendlyEventTypeOption[];
      userUri: string;
      organizationUri: string;
      userEmail: string;
      userName: string;
    }
  | {
      ok: false;
      status: number;
      errorCode: "invalid_token" | "missing_scopes" | "organization_not_found";
      error: string;
      types: CalendlyEventTypeOption[];
    };

export async function previewCalendlyEventTypes(token: string): Promise<CalendlyEventTypePreviewResult> {
  const me = await calendlyGetCurrentUser(token);
  const meResource = me.data?.resource;
  if (me.status === 401) {
    return {
      ok: false,
      status: 401,
      errorCode: "invalid_token",
      error: "Invalid Calendly token. Check that you copied the full personal access token.",
      types: [],
    };
  }
  if (me.status === 403) {
    return {
      ok: false,
      status: 403,
      errorCode: "missing_scopes",
      error: "Calendly token is missing required scopes. Create a new personal access token with webhook and event type access.",
      types: [],
    };
  }
  if (!me.ok) {
    return {
      ok: false,
      status: me.status || 400,
      errorCode: "invalid_token",
      error: "Could not validate Calendly token.",
      types: [],
    };
  }
  const organizationUri = String(meResource?.current_organization || "").trim();
  if (!organizationUri) {
    return {
      ok: false,
      status: 400,
      errorCode: "organization_not_found",
      error: "Calendly organization not found for this token.",
      types: [],
    };
  }
  const listed = await loadActiveCalendlyEventTypes(token, {
    user: meResource?.uri,
    organization: organizationUri,
  });
  if (listed.status === 403) {
    return {
      ok: false,
      status: 403,
      errorCode: "missing_scopes",
      error: "Calendly token is missing event type access. Create a new personal access token with event type access.",
      types: [],
    };
  }
  if (!listed.ok) {
    return {
      ok: false,
      status: listed.status || 400,
      errorCode: "invalid_token",
      error: "Could not load Calendly event types.",
      types: [],
    };
  }
  return {
    ok: true,
    status: 200,
    types: listed.types,
    userUri: String(meResource?.uri || ""),
    organizationUri,
    userEmail: String(meResource?.email || ""),
    userName: String(meResource?.name || ""),
  };
}

export function publicCalendlyEventTypePayload(
  cfg: Record<string, unknown>,
  types: CalendlyEventTypeOption[],
) {
  const applied = applyCalendlyEventSelection(cfg, types, selectedCalendlyEventTypeUri(cfg));
  const selectedUri = selectedCalendlyEventTypeUri(applied.cfg);
  return {
    eventTypes: publicCalendlyEventTypes(types),
    selectedEventTypeUri: selectedUri,
    selectedEventTypeName:
      typeof applied.cfg.calendlySelectedEventTypeName === "string"
        ? applied.cfg.calendlySelectedEventTypeName
        : "",
    selectedEventSchedulingUrl:
      typeof applied.cfg.calendlySelectedEventSchedulingUrl === "string"
        ? applied.cfg.calendlySelectedEventSchedulingUrl
        : "",
    selectionRequired: applied.selectionRequired,
    bookingSyncEnabled: calendlyBookingSyncEnabled(applied.cfg),
  };
}
