import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, RequestHandler, Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../drizzle/db";
import { teamMembers, users, type TeamMember } from "@shared/schema";
import { subscriptionService } from "./subscriptionService";
import { sendTeamInvitationEmail } from "./email";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const normalize = (email: string) => email.trim().toLowerCase();
export class InvitationError extends Error {
  constructor(public status: number, message: string, public details = {}) { super(message); }
}
function signature(member: TeamMember): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for team invitations");
  return createHmac("sha256", secret).update(JSON.stringify([
    "whachat-team-invitation-v1", member.id, member.ownerId, normalize(member.email),
    member.role, member.invitedAt?.getTime(),
  ])).digest("base64url");
}
export function invitationToken(member: TeamMember): string {
  return `${member.id}.${signature(member)}`;
}
function validToken(member: TeamMember, token: string): boolean {
  if (member.status !== "pending" || member.memberId || member.joinedAt || !member.invitedAt ||
      !["member", "admin"].includes(member.role) ||
      member.invitedAt.getTime() > Date.now() || Date.now() >= member.invitedAt.getTime() + INVITATION_TTL_MS) return false;
  const expected = Buffer.from(invitationToken(member));
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
const invalid = () => new InvitationError(410, "Invitation expired, revoked or already used. Ask the owner to resend it.");
const inviteInput = z.object({ email: z.string().trim().email().max(254), name: z.string().trim().max(200).optional(), role: z.enum(["member", "admin"]).default("member") });

export async function issueTeamInvitation(ownerId: string, input: unknown, resendId?: string) {
  // Fail before creating a row if signing isn't configured.
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for team invitations");
  const parsed = resendId ? null : inviteInput.safeParse(input);
  if (parsed && !parsed.success) throw new InvitationError(400, "Invalid invitation email, name or role");
  const limits = await subscriptionService.getUserLimits(ownerId);
  if (!limits) throw new InvitationError(400, "Could not fetch subscription limits");
  return db.transaction(async tx => {
    // Serialize seat checks and duplicates for this owner without changing historical rows.
    const [owner] = await tx.select().from(users).where(eq(users.id, ownerId)).for("update");
    if (!owner?.emailVerifiedAt || owner.deletionRequestedAt) throw new InvitationError(403, "Account verification required");
    const existing = await tx.select().from(teamMembers).where(eq(teamMembers.ownerId, ownerId));
    if (resendId) {
      const member = existing.find(m => m.id === resendId);
      if (!member) throw new InvitationError(404, "Invitation not found");
      if (member.status !== "pending" || member.memberId || member.joinedAt) throw new InvitationError(409, "Only pending invitations can be resent");
      const [updated] = await tx.update(teamMembers).set({ invitedAt: new Date(Math.max(Date.now(), (member.invitedAt?.getTime() || 0) + 1)) })
        .where(and(eq(teamMembers.id, member.id), eq(teamMembers.status, "pending"))).returning();
      if (!updated) throw invalid();
      return updated;
    }
    const data = parsed && parsed.success ? parsed.data : null;
    if (!data) throw new InvitationError(400, "Invalid invitation");
    const email = normalize(data.email);
    if (email === normalize(owner.email)) throw new InvitationError(409, "The owner already belongs to this workspace");
    if (existing.some(m => normalize(m.email) === email)) throw new InvitationError(409, "This email already has a membership or invitation. Remove it before inviting again.");
    const count = 1 + existing.filter(m => m.role !== "owner" && ["active", "pending"].includes(m.status)).length;
    if (limits.maxUsers !== -1 && count >= limits.maxUsers) throw new InvitationError(403,
      "Your plan does not allow more team members. Upgrade to invite more users.", { upgradeRequired: true, plan: limits.plan });
    const [member] = await tx.insert(teamMembers).values({ ownerId, email, name: data.name || null, role: data.role, status: "pending", invitedAt: new Date() }).returning();
    return member;
  });
}

export async function acceptTeamInvitation(actorId: string, token: string, preview = false) {
  if (typeof token !== "string" || !/^[a-zA-Z0-9-]{1,128}\.[a-zA-Z0-9_-]{43}$/.test(token)) throw invalid();
  const id = token.split(".")[0];
  return db.transaction(async tx => {
    const [candidate] = await tx.select().from(teamMembers).where(eq(teamMembers.id, id));
    if (!candidate) throw invalid();
    const [owner] = await tx.select().from(users).where(eq(users.id, candidate.ownerId)).for("update");
    if (!owner || owner.deletionRequestedAt) throw invalid();
    const [member] = await tx.select().from(teamMembers).where(eq(teamMembers.id, id)).for("update");
    if (!member || !validToken(member, token)) throw invalid();
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId)).for("update");
    if (!actor?.emailVerifiedAt || actor.deletionRequestedAt || normalize(actor.email) !== normalize(member.email)) {
      throw new InvitationError(403, "Sign in with the verified email address that received this invitation.");
    }
    if (actor.id === owner.id) throw new InvitationError(409, "The owner already belongs to this workspace");
    const conflicts = await tx.select().from(teamMembers).where(and(eq(teamMembers.ownerId, owner.id), sql`${teamMembers.id} <> ${member.id}`));
    if (conflicts.some(m => m.memberId === actorId || normalize(m.email) === normalize(actor.email))) {
      throw new InvitationError(409, "A membership already exists in this workspace. Contact the owner.");
    }
    if (preview) return { ...member, workspaceName: owner.name || owner.email };
    const [accepted] = await tx.update(teamMembers).set({ memberId: actorId, status: "active", joinedAt: new Date() })
      .where(and(eq(teamMembers.id, id), eq(teamMembers.status, "pending"))).returning();
    if (!accepted) throw invalid();
    return { ...accepted, workspaceName: owner.name || owner.email };
  });
}

// No token in a URL sent to the API, access log, or response. Email links use a fragment.
export const teamInvitationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: req => req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip || "unknown")}`, legacyHeaders: false, standardHeaders: "draft-7" });
export const requireTeamInvitationActor: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.user) return void res.status(401).json({ error: "Unauthorized" });
  if (!req.user.emailVerifiedAt || req.user.deletionRequestedAt) return void res.status(403).json({ error: "Account verification required" });
  const origin = req.get("origin");
  if (req.get("sec-fetch-site") === "cross-site") return void res.status(403).json({ error: "Forbidden" });
  if (origin) {
    try { if (new URL(origin).origin !== `${req.protocol}://${req.get("host")}`) return void res.status(403).json({ error: "Forbidden" }); }
    catch { return void res.status(403).json({ error: "Forbidden" }); }
  }
  next();
};
export function invitationFailure(res: Response, error: unknown) {
  if (error instanceof InvitationError) return res.status(error.status).json({ error: error.message, ...error.details });
  // Do not log request payloads or provider exceptions containing the capability.
  return res.status(500).json({ error: "Unable to process team invitation" });
}
export async function deliverTeamInvitation(member: TeamMember) {
  const token = invitationToken(member);
  const delivered = await sendTeamInvitationEmail(member.email, token);
  return { ...member, deliveryStatus: delivered ? "sent" : "failed" };
}
export function registerTeamInvitationRoutes(app: Express) {
  app.post("/api/team/invitations/preview", teamInvitationLimiter, requireTeamInvitationActor, async (req, res) => {
    try {
      const member = await acceptTeamInvitation(req.user!.id, req.body?.token, true);
      res.json({ workspaceName: member.workspaceName, email: member.email, role: member.role });
    } catch (error) { invitationFailure(res, error); }
  });
  app.post("/api/team/invitations/accept", teamInvitationLimiter, requireTeamInvitationActor, async (req, res) => {
    try {
      const member = await acceptTeamInvitation(req.user!.id, req.body?.token);
      req.session.inboxWorkspaceId = member.ownerId;
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.json({ workspaceId: member.ownerId, role: member.role, reloadRequired: true });
    } catch (error) { invitationFailure(res, error); }
  });
  app.post("/api/team/:id/resend", teamInvitationLimiter, requireTeamInvitationActor, async (req, res) => {
    try { res.json(await deliverTeamInvitation(await issueTeamInvitation(req.user!.id, null, req.params.id))); }
    catch (error) { invitationFailure(res, error); }
  });
}
