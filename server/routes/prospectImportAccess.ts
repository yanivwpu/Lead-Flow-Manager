import type { Request, Response, NextFunction } from "express";
import { canAccessProspectImportTools } from "@shared/prospectImportAccess";

export function requireProspectImportAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const session = req.session as { isAdmin?: boolean } | undefined;
  if (!canAccessProspectImportTools(req.user as { id: string; email?: string | null }, session)) {
    res.status(403).json({ error: "Growth Tools access denied" });
    return;
  }
  next();
}
