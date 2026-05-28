import { isRgeInstalledForUser } from "../buyerPreferenceService";

export function isInventoryConnectorEnabled(): boolean {
  const v = process.env.INVENTORY_CONNECTOR_ENABLED;
  return v === "1" || v === "true";
}

export async function canUseInventoryConnector(
  userId: string,
): Promise<{ ok: boolean; reason: string }> {
  if (!isInventoryConnectorEnabled()) {
    return { ok: false, reason: "feature_disabled" };
  }
  if (await isRgeInstalledForUser(userId)) {
    return { ok: true, reason: "rge_installed" };
  }
  return { ok: false, reason: "rge_not_installed" };
}
