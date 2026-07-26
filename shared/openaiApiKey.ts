/**
 * Resolve and validate OpenAI API keys for Prospect AI / AIProvider.
 * Prevents common misconfiguration: Resend (`re_…`) keys wired into OpenAI env vars.
 */

export type ResolvedOpenAiApiKey =
  | { ok: true; apiKey: string; source: "AI_INTEGRATIONS_OPENAI_API_KEY" | "OPENAI_API_KEY" }
  | { ok: false; reason: string };

/** Resend keys start with `re_`; must never be sent to OpenAI. */
export function looksLikeResendApiKey(key: string): boolean {
  return /^re_[A-Za-z0-9]/i.test(String(key || "").trim());
}

/** OpenAI secret keys typically start with sk- / sk-proj-. */
export function looksLikeOpenAiApiKey(key: string): boolean {
  const k = String(key || "").trim();
  if (!k) return false;
  if (looksLikeResendApiKey(k)) return false;
  if (/^whsec_/i.test(k)) return false;
  if (/^sk-/i.test(k)) return true;
  // Allow other non-Resend values (custom gateway tokens) but prefer sk-.
  return k.length >= 20 && !/^re_/i.test(k);
}

export function resolveOpenAiApiKey(env: NodeJS.ProcessEnv = process.env): ResolvedOpenAiApiKey {
  const integrations = String(env.AI_INTEGRATIONS_OPENAI_API_KEY || "").trim();
  const openai = String(env.OPENAI_API_KEY || "").trim();

  if (integrations && looksLikeOpenAiApiKey(integrations) && !looksLikeResendApiKey(integrations)) {
    return { ok: true, apiKey: integrations, source: "AI_INTEGRATIONS_OPENAI_API_KEY" };
  }
  if (openai && looksLikeOpenAiApiKey(openai) && !looksLikeResendApiKey(openai)) {
    return { ok: true, apiKey: openai, source: "OPENAI_API_KEY" };
  }

  if (integrations && looksLikeResendApiKey(integrations)) {
    if (openai && looksLikeOpenAiApiKey(openai)) {
      return { ok: true, apiKey: openai, source: "OPENAI_API_KEY" };
    }
    return {
      ok: false,
      reason:
        "OpenAI API key is misconfigured: AI_INTEGRATIONS_OPENAI_API_KEY looks like a Resend key (re_...). Set a valid OpenAI key (sk-...) on AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.",
    };
  }

  if (openai && looksLikeResendApiKey(openai)) {
    return {
      ok: false,
      reason:
        "OpenAI API key is misconfigured: OPENAI_API_KEY looks like a Resend key (re_...). Set a valid OpenAI key (sk-...).",
    };
  }

  if (!integrations && !openai) {
    return {
      ok: false,
      reason:
        "OpenAI API key is missing. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY to a valid OpenAI key.",
    };
  }

  // Non-empty but unrecognized — still try integrations first, then openai.
  if (integrations) {
    return { ok: true, apiKey: integrations, source: "AI_INTEGRATIONS_OPENAI_API_KEY" };
  }
  return { ok: true, apiKey: openai, source: "OPENAI_API_KEY" };
}

/**
 * Map provider errors to a safe, actionable message for prospect_intelligence.error_message.
 * Strips leaked key material from OpenAI 401 messages.
 */
export function formatProspectAiProviderFailureMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.trim();

  if (/looks like a Resend key|OpenAI API key is misconfigured|OpenAI API key is missing/i.test(msg)) {
    return msg.substring(0, 500);
  }

  if (/Incorrect API key|invalid[_ ]api[_ ]key|authentication|401/i.test(msg)) {
    if (/re_[A-Za-z0-9]/i.test(msg)) {
      return "OpenAI API authentication failed: a Resend key (re_...) was sent instead of an OpenAI key. Fix AI_INTEGRATIONS_OPENAI_API_KEY / OPENAI_API_KEY, then retry.";
    }
    return "OpenAI API authentication failed. Check AI_INTEGRATIONS_OPENAI_API_KEY / OPENAI_API_KEY, then retry.";
  }

  if (/JSON\.parse|Unexpected token|not valid JSON/i.test(msg)) {
    return `AI response parsing failed: ${msg}`.substring(0, 500);
  }

  return (msg || "Qualification failed").substring(0, 500);
}
