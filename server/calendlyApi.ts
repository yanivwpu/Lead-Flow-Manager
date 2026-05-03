const CALENDLY_API = "https://api.calendly.com";

async function calendlyJson<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${CALENDLY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function calendlyGetCurrentUser(token: string) {
  return calendlyJson<{ resource?: { uri?: string; current_organization?: string } }>(
    "/users/me",
    token
  );
}

export async function calendlyCreateWebhookSubscription(
  token: string,
  body: { url: string; events: string[]; organization: string; scope: string }
) {
  return calendlyJson<{ resource?: { uri?: string; signing_key?: string; state?: string } }>(
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
  if (!uuid) return { ok: false, status: 0, data: {} as { message?: string } };
  return calendlyJson<{ message?: string }>(`/webhook_subscriptions/${uuid}`, token, {
    method: "DELETE",
  });
}

export async function calendlyListEventTypes(token: string, organizationUri: string) {
  const q = encodeURIComponent(organizationUri);
  return calendlyJson<{ collection?: Array<{ name?: string; slug?: string; uri?: string }> }>(
    `/event_types?organization=${q}&active=true`,
    token
  );
}
