import type { AgentPageSettingsResponse } from "@shared/agent/agentPageSchema";

export function parseAgentPageApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  const record = body as { error?: unknown; message?: unknown };
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (record.error && typeof record.error === "object") {
    const flat = record.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const parts = [
      ...(flat.formErrors ?? []),
      ...Object.values(flat.fieldErrors ?? {}).flat(),
    ].filter(Boolean);
    if (parts.length > 0) return parts.join("; ");
  }
  return "Request failed";
}

export async function fetchAgentPageSettings(): Promise<AgentPageSettingsResponse> {
  const res = await fetch("/api/agent-page", { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseAgentPageApiError(body));
  }
  return res.json();
}
