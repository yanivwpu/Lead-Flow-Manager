import type { Request, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { teamMembers, users } from "@shared/schema";
import { isEmailVerified } from "./authSecurity";
import type { InboxWorkspaceAccess } from "./inboxWorkspaceContext";
export { inboxWorkspaceId, isInboxAdmin, type InboxWorkspaceAccess } from "./inboxWorkspaceContext";

/** Only linked, active memberships confer access. Email/pending invites are never grants. */
export async function getInboxWorkspaceAccess(actorUserId: string, workspaceUserId: string): Promise<InboxWorkspaceAccess | null> {
  const [owner] = await db.select({ id: users.id, deleted: users.deletionRequestedAt })
    .from(users).where(eq(users.id, workspaceUserId)).limit(1);
  if (!owner || owner.deleted) return null;
  if (actorUserId === workspaceUserId) return { actorUserId, workspaceUserId, role: "owner" };
  const [actor] = await db.select({ deleted: users.deletionRequestedAt }).from(users)
    .where(eq(users.id, actorUserId)).limit(1);
  if (!actor || actor.deleted) return null;
  const [membership] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(
    eq(teamMembers.ownerId, workspaceUserId), eq(teamMembers.memberId, actorUserId),
    eq(teamMembers.status, "active"),
  )).limit(1);
  if (membership?.role !== "admin" && membership?.role !== "member") return null;
  return { actorUserId, workspaceUserId, role: membership.role };
}

export async function listInboxWorkspaces(actorUserId: string): Promise<string[]> {
  const memberships = await db.select({ ownerId: teamMembers.ownerId }).from(teamMembers).where(and(
    eq(teamMembers.memberId, actorUserId), eq(teamMembers.status, "active"),
  ));
  const allowed: string[] = [];
  for (const id of new Set([actorUserId, ...memberships.map(m => m.ownerId)])) {
    if (await getInboxWorkspaceAccess(actorUserId, id)) allowed.push(id);
  }
  return allowed;
}

export async function resolveInboxWorkspace(req: Request): Promise<InboxWorkspaceAccess | null> {
  if (!req.user?.id) return null;
  const actor = req.user.id;
  // The server session is a selection, never an authorization cache. Revalidate on every request.
  if (req.session?.inboxWorkspaceId) return getInboxWorkspaceAccess(actor, req.session.inboxWorkspaceId);
  const choices = await listInboxWorkspaces(actor);
  let selected = actor;
  const teams = choices.filter(id => id !== actor);
  if (teams.length === 1) {
    // New teammate accounts can open the existing Inbox without a new UI. Never redirect
    // an established owner's Inbox. Ambiguous memberships retain the personal workspace.
    const result = await db.execute(sql`SELECT (
      EXISTS (SELECT 1 FROM contacts WHERE user_id = ${actor}) OR
      EXISTS (SELECT 1 FROM chats WHERE user_id = ${actor}) OR
      EXISTS (SELECT 1 FROM team_members WHERE owner_id = ${actor}) OR
      EXISTS (SELECT 1 FROM integrations WHERE user_id = ${actor} AND is_active = true) OR
      EXISTS (SELECT 1 FROM channel_settings WHERE user_id = ${actor} AND is_connected = true)
    ) AS owned`);
    if (!result.rows[0]?.owned) selected = teams[0];
  }
  if (selected !== actor && req.session) {
    req.session.inboxWorkspaceId = selected;
    await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  }
  return getInboxWorkspaceAccess(actor, selected);
}

export const requireInboxWorkspace: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (req.user.deletionRequestedAt || !isEmailVerified(req.user)) {
      res.status(403).json({ error: "Account verification required" }); return;
    }
    const access = await resolveInboxWorkspace(req);
    if (!access) { res.status(403).json({ error: "Workspace access revoked or unavailable" }); return; }
    req.inboxWorkspace = access;
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch (error) { next(error); }
};
