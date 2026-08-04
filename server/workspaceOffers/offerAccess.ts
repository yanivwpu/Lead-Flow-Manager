/**
 * Workspace Offers authorization.
 * Tenancy: workspace = account owner users.id.
 * Editors: workspace owner, or active team member with role owner/admin on that workspace.
 */

import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../../drizzle/db";
import { teamMembers } from "@shared/schema";

/** Pure role gate used by tests and the DB-backed checker. */
export function isWorkspaceOffersAdminRole(role: string | null | undefined): boolean {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

/**
 * Pure tenancy + role check.
 * - Same actor/workspace id → account holder may manage.
 * - Otherwise requires an admin/owner team role on that workspace.
 */
export function resolveWorkspaceOffersAdminAccess(input: {
  actorUserId: string;
  workspaceUserId: string;
  membershipRole?: string | null;
}): boolean {
  if (!input.actorUserId || !input.workspaceUserId) return false;
  if (input.actorUserId === input.workspaceUserId) return true;
  return isWorkspaceOffersAdminRole(input.membershipRole);
}

export async function canManageWorkspaceOffers(
  actorUserId: string,
  workspaceUserId: string,
): Promise<boolean> {
  if (!actorUserId || !workspaceUserId) return false;
  if (actorUserId === workspaceUserId) return true;

  const [membership] = await db
    .select({ role: teamMembers.role, status: teamMembers.status })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.ownerId, workspaceUserId),
        eq(teamMembers.memberId, actorUserId),
        eq(teamMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!membership) return false;
  return resolveWorkspaceOffersAdminAccess({
    actorUserId,
    workspaceUserId,
    membershipRole: membership.role,
  });
}

/**
 * Resolve the workspace for offer CRUD.
 * Today the session user is the workspace owner (standard WhachatCRM tenancy).
 * Returns null and writes 401/403 when the actor cannot manage offers.
 */
export async function requireWorkspaceOffersAdmin(
  req: Request,
  res: Response,
): Promise<{ workspaceUserId: string; actorUserId: string } | null> {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const actorUserId = req.user.id;
  const workspaceUserId = actorUserId;
  const allowed = await canManageWorkspaceOffers(actorUserId, workspaceUserId);
  if (!allowed) {
    res.status(403).json({ error: "Only workspace admins can manage offers" });
    return null;
  }
  return { workspaceUserId, actorUserId };
}
