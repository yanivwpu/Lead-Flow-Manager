import type { Request } from "express";

export type InboxWorkspaceAccess = {
  actorUserId: string;
  workspaceUserId: string;
  role: "owner" | "admin" | "member";
};
declare global {
  namespace Express {
    interface Request { inboxWorkspace?: InboxWorkspaceAccess }
  }
}
declare module "express-session" {
  interface SessionData { inboxWorkspaceId?: string }
}

/** Unconverted routes retain owner-only access; never replace the authenticated user. */
export function inboxWorkspaceId(req: Request): string {
  return req.inboxWorkspace?.workspaceUserId ?? req.user!.id;
}
export function isInboxAdmin(req: Request): boolean {
  return !req.inboxWorkspace || req.inboxWorkspace.role === "owner" || req.inboxWorkspace.role === "admin";
}
