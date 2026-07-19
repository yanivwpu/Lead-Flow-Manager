import type { Request, Response, NextFunction } from "express";
import { canAccessProspectWorkspaceTools } from "../prospectImport/prospectWorkspaceScope";

export function requireProspectImportAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = req.session as { isAdmin?: boolean } | undefined;
  const user = req.user as { id: string; email?: string | null };

  void canAccessProspectWorkspaceTools({
    userId: user.id,
    email: user.email,
    isAdmin: session?.isAdmin === true,
  })
    .then((allowed) => {
      if (!allowed) {
        res.status(403).json({ error: "Prospect AI access denied" });
        return;
      }
      next();
    })
    .catch((err) => {
      console.error("[ProspectAccess] access check failed:", err);
      res.status(500).json({ error: "Failed to verify Prospect AI access" });
    });
}
