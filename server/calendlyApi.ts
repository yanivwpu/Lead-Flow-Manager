const CALENDLY_API = "https://api.calendly.com";

async function calendlyJson<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T; rawBody: string }> {
  const res = await fetch(`${CALENDLY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const rawBody = await res.text().catch(() => "");
  const data = (rawBody
    ? (() => {
        try {
          return JSON.parse(rawBody);
        } catch {
          return {};
        }
      })()
    : {}) as T;
  return { ok: res.ok, status: res.status, data, rawBody };
}

export type CalendlyWebhookSubscriptionPayload = {
  url: string;
  events: string[];
  organization: string;
  scope: string;
  user?: string;
  signing_key?: string;
};

export async function calendlyGetCurrentUser(token: string) {
  return calendlyJson<{
    resource?: {
      uri?: string;
      current_organization?: string;
      scheduling_url?: string;
      email?: string;
      name?: string;
    };
  }>("/users/me", token);
}

export async function calendlyGetOrganization(token: string, organizationUri: string) {
  const uuid = calendlyResourceUuid(organizationUri);
  if (!uuid) {
    return { ok: false, status: 0, data: {} as { resource?: { uri?: string; name?: string }; message?: string }, rawBody: "" };
  }
  return calendlyJson<{
    resource?: { uri?: string; name?: string };
    message?: string;
    title?: string;
    details?: { message?: string }[];
  }>(`/organizations/${uuid}`, token);
}

export async function calendlyCreateWebhookSubscription(
  token: string,
  body: CalendlyWebhookSubscriptionPayload
) {
  return calendlyJson<{
    resource?: { uri?: string; signing_key?: string; state?: string };
    message?: string;
    title?: string;
    details?: { message?: string }[];
  }>(
    "/webhook_subscriptions",
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
}

/** Returns last path segment (UUID) from a Calendly resource URI. */
export function calendlyResourceUuid(uri: string): string | undefined {
  const parts = uri.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export async function calendlyDeleteWebhookSubscription(token: string, subscriptionUri: string) {
  const uuid = calendlyResourceUuid(subscriptionUri);
  if (!uuid) return { ok: false, status: 0, data: {} as { message?: string }, rawBody: "" };
  return calendlyJson<{ message?: string }>(`/webhook_subscriptions/${uuid}`, token, {
    method: "DELETE",
  });
}

export async function calendlyGetWebhookSubscription(token: string, subscriptionUri: string) {
  const uuid = calendlyResourceUuid(subscriptionUri);
  if (!uuid) {
    return {
      ok: false,
      status: 0,
      data: {} as {
        resource?: {
          uri?: string;
          callback_url?: string;
          events?: string[];
          organization?: string;
          scope?: string;
          state?: string;
          signing_key?: string;
        };
        message?: string;
      },
      rawBody: "",
    };
  }
  return calendlyJson<{
    resource?: {
      uri?: string;
      callback_url?: string;
      events?: string[];
      organization?: string;
      scope?: string;
      state?: string;
      signing_key?: string;
    };
    message?: string;
    title?: string;
    details?: { message?: string }[];
  }>(`/webhook_subscriptions/${uuid}`, token);
}

export async function calendlyListWebhookSubscriptions(token: string, organizationUri: string) {
  const q = encodeURIComponent(organizationUri);
  return calendlyJson<{
    collection?: Array<{
      uri?: string;
      callback_url?: string;
      events?: string[];
      organization?: string;
      scope?: string;
      state?: string;
      created_at?: string;
      updated_at?: string;
    }>;
    message?: string;
    title?: string;
    details?: { message?: string }[];
  }>(`/webhook_subscriptions?organization=${q}&scope=organization`, token);
}

export async function calendlyListEventTypes(token: string, organizationUri: string) {
  const q = encodeURIComponent(organizationUri);
  return calendlyJson<{
    collection?: Array<{ name?: string; slug?: string; uri?: string; scheduling_url?: string }>;
  }>(`/event_types?organization=${q}&active=true`, token);
}

export type CalendlyScheduledEventResource = {
  uri?: string;
  name?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  event_type?: string;
  location?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type CalendlyEventInviteeResource = {
  uri?: string;
  email?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  status?: string;
  tracking?: Record<string, unknown>;
  reschedule_url?: string;
  cancel_url?: string;
  scheduled_event?: string | Record<string, unknown>;
  cancellation?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type CalendlyPagination = {
  count?: number;
  next_page?: string | null;
  next_page_token?: string | null;
  previous_page?: string | null;
  previous_page_token?: string | null;
};

export async function calendlyListScheduledEvents(
  token: string,
  params: {
    user?: string;
    organization?: string;
    minStartTime: string;
    maxStartTime?: string;
    count?: number;
    pageToken?: string;
  },
) {
  const search = new URLSearchParams();
  if (params.user) search.set("user", params.user);
  if (params.organization) search.set("organization", params.organization);
  search.set("min_start_time", params.minStartTime);
  if (params.maxStartTime) search.set("max_start_time", params.maxStartTime);
  search.set("count", String(Math.min(params.count ?? 100, 100)));
  if (params.pageToken) search.set("page_token", params.pageToken);
  return calendlyJson<{
    collection?: CalendlyScheduledEventResource[];
    pagination?: CalendlyPagination;
    message?: string;
    title?: string;
  }>(`/scheduled_events?${search.toString()}`, token);
}

export async function calendlyListEventInvitees(
  token: string,
  scheduledEventUri: string,
  pageToken?: string,
) {
  const uuid = calendlyResourceUuid(scheduledEventUri);
  if (!uuid) {
    return {
      ok: false,
      status: 0,
      data: { collection: [] as CalendlyEventInviteeResource[] },
      rawBody: "",
    };
  }
  const search = new URLSearchParams({ count: "100" });
  if (pageToken) search.set("page_token", pageToken);
  return calendlyJson<{
    collection?: CalendlyEventInviteeResource[];
    pagination?: CalendlyPagination;
    message?: string;
  }>(`/scheduled_events/${uuid}/invitees?${search.toString()}`, token);
}
