import { storage } from "../storage";
import { createEcommercePilotGuard } from "./pilotGuard";
import { ecommercePilotAccountMatches, isEcommercePilotOwner } from "./pilotAccess";

export const requireEcommercePilot = createEcommercePilotGuard({
  env: process.env, getOwner: id => storage.getUserForSession(id),
});

export async function canRecordEcommercePilot(accountId: string): Promise<boolean> {
  // Other merchants incur no additional database work, even with the global flag set.
  if (!ecommercePilotAccountMatches(accountId, process.env)) return false;
  return isEcommercePilotOwner(await storage.getUserForSession(accountId), process.env);
}
