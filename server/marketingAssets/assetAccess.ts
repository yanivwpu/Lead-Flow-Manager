/**
 * Marketing Materials authorization — same workspace-admin tenancy as Offers.
 */

import type { Request, Response } from "express";
import {
  canManageWorkspaceOffers,
  isWorkspaceOffersAdminRole,
  resolveWorkspaceOffersAdminAccess,
} from "../workspaceOffers/offerAccess";

export const isMarketingAssetsAdminRole = isWorkspaceOffersAdminRole;
export const resolveMarketingAssetsAdminAccess = resolveWorkspaceOffersAdminAccess;
export const canManageMarketingAssets = canManageWorkspaceOffers;

export async function requireMarketingAssetsAdmin(
  req: Request,
  res: Response,
): Promise<{ workspaceUserId: string; actorUserId: string } | null> {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const actorUserId = req.user.id;
  const workspaceUserId = actorUserId;
  const allowed = await canManageMarketingAssets(actorUserId, workspaceUserId);
  if (!allowed) {
    res.status(403).json({ error: "Only workspace admins can manage marketing materials" });
    return null;
  }
  return { workspaceUserId, actorUserId };
}
