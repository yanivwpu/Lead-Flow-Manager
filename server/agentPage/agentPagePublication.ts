import { RGE_TEMPLATE_ID } from "@shared/rgePaths";
import { evaluateGrowthEngineAccess } from "../growthEngineEntitlements";
import { shouldAutoGrantGrowthEngineViaAdminOverride } from "../growthEngineProvisioning";
import { storage } from "../storage";

/** Read the same RGE access used by activation without mutating billing on crawler requests. */
export async function hasAgentPagePublicationAccess(userId: string): Promise<boolean> {
  const [entitlement, install] = await Promise.all([
    storage.getTemplateEntitlement(userId, RGE_TEMPLATE_ID),
    storage.getTemplateInstall(userId, RGE_TEMPLATE_ID),
  ]);
  if (install?.installStatus === "uninstalled") return false;

  const access = await evaluateGrowthEngineAccess(userId, { readOnly: true });
  if (!access.ok) return false;
  if (shouldAutoGrantGrowthEngineViaAdminOverride(access.limits)) return true;

  // Honor pre-entitlement installs. A recorded lock takes precedence over a legacy install.
  if (!entitlement) return install?.installStatus === "installed";
  return ["purchased", "submitted", "installed"].includes(entitlement.status);
}
