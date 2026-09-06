/**
 * Sales Admin gate shared by /api/admin/* (including queue endpoints registered in index.ts).
 * CRM login (req.user) is never sufficient.
 */

import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { timingSafeStringEqual } from "@shared/timingSafeEqual";
import { adminDenialStatus, isAdminAuthorized } from "@shared/adminAccess";
import { storage } from "./storage";

const ADMIN_TOKEN_SECRET = process.env.SESSION_SECRET || "whatsapp-crm-secret-key-change-in-production";

export function computeAdminToken(hash: string): string {
  return crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(hash).digest("hex");
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const storedHash = await storage.getAdminPasswordHash();
  if (!storedHash) return false;
  return timingSafeStringEqual(computeAdminToken(storedHash), token);
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionIsAdmin = (req.session as { isAdmin?: boolean } | undefined)?.isAdmin === true;
  const adminToken = req.headers["x-admin-token"] as string | undefined;
  const ok = await isAdminAuthorized({ sessionIsAdmin, adminToken }, verifyAdminToken);
  if (ok) {
    next();
    return;
  }
  const status = adminDenialStatus({
    isAdmin: false,
    hasCrmUser: Boolean((req as Request & { user?: { id?: string } }).user?.id),
  });
  const code = status ?? 401;
  res.status(code).json({
    error: code === 403 ? "Forbidden" : "Admin authentication required",
  });
}
