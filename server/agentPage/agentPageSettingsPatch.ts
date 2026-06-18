import type { AgentPageSettingsPatch } from "@shared/agent/agentPageSchema";
import { buildAgentPageSlug, validateAgentPageSlugInput } from "@shared/agent/agentPageSlug";
import type { AgentPageSettingsResponse } from "@shared/agent/agentPageSchema";
import type { ZodError } from "zod";

export type AgentPagePatchPrepareResult =
  | { ok: true; patch: AgentPageSettingsPatch & { agentPageSlug?: string | null } }
  | { ok: false; status: number; error: string; code: string };

function formatZodPatchError(error: ZodError): string {
  const messages = error.issues.map((i) => i.message).filter(Boolean);
  return messages.length > 0 ? messages.join("; ") : "Invalid agent page settings";
}

/** Normalize PATCH body — slug validation and auto-slug on enable. No publish gate. */
export async function prepareAgentPageSettingsPatch(
  userId: string,
  body: unknown,
  parsePatch: (
    body: unknown,
  ) =>
    | { success: true; data: AgentPageSettingsPatch }
    | { success: false; error: ZodError },
  loadCurrent: () => Promise<AgentPageSettingsResponse | undefined>,
): Promise<AgentPagePatchPrepareResult> {
  const parsed = parsePatch(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: formatZodPatchError(parsed.error),
      code: "validation_error",
    };
  }

  const patch = { ...parsed.data };
  let slug = patch.agentPageSlug;

  if (slug !== undefined && slug !== null && String(slug).trim() !== "") {
    const validated = validateAgentPageSlugInput(String(slug));
    if (!validated.ok) {
      return { ok: false, status: 400, error: validated.error, code: "invalid_slug" };
    }
    slug = validated.slug;
  } else if (slug !== undefined) {
    slug = null;
  }

  if (slug === undefined && patch.agentPageEnabled === true) {
    const current = await loadCurrent();
    if (current && !current.agentPageSlug) {
      const auto = buildAgentPageSlug(current.businessProfileDisplayName, userId);
      if (auto) slug = auto;
    }
  }

  if (patch.agentPageUseCustomBio === false) {
    patch.agentPageBio = null;
  }

  return {
    ok: true,
    patch: {
      ...patch,
      agentPageSlug: slug !== undefined ? slug : patch.agentPageSlug,
    },
  };
}

export function isAgentPageSlugConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  return (
    code === "23505" ||
    message.includes("unique") ||
    message.includes("duplicate") ||
    message.includes("ai_business_knowledge_agent_page_slug_lower")
  );
}
