/**
 * Agent Page profile resolution — Business Profile is the source of truth for name/about.
 */

export type AgentPageProfileSource = {
  displayName?: string | null;
  aboutText?: string | null;
  agentPageUseCustomBio?: boolean;
  agentPageBio?: string | null;
};

function str(value: string | null | undefined): string {
  return (value || "").trim();
}

/** Display name on the public agent page — from Business Profile only. */
export function resolveAgentPageDisplayName(
  profile: AgentPageProfileSource,
  userName?: string | null,
): string {
  return str(profile.displayName) || str(userName) || "Agent";
}

/** Bio shown on the public agent page. */
export function resolveAgentPageBio(profile: AgentPageProfileSource): string {
  if (profile.agentPageUseCustomBio && str(profile.agentPageBio)) {
    return str(profile.agentPageBio);
  }
  return str(profile.aboutText);
}

/** Whether settings PATCH may proceed — publishing gates visibility only, never save. */
export function agentPageSettingsSaveAlwaysAllowed(): true {
  return true;
}
