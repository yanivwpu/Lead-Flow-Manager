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
};

export async function calendlyGetCurrentUser(token: string) {
  return calendlyJson<{
    resource?: { uri?: string; current_organization?: string; scheduling_url?: string };
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

export async function calendlyListEventTypes(token: string, organizationUri: string) {
  const q = encodeURIComponent(organizationUri);
  return calendlyJson<{
    collection?: Array<{ name?: string; slug?: string; uri?: string; scheduling_url?: string }>;
  }>(`/event_types?organization=${q}&active=true`, token);
}
