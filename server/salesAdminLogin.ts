import type { Express } from "express";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { computeAdminToken } from "./adminAuth";

/** Login only. First-admin provisioning is never performed by a public request. */
export function registerSalesAdminLoginRoute(app: Express): void {
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body || {};
      const storedHash = await storage.getAdminPasswordHash();

      // Provisioning is operator-only; public login never writes credentials.
      if (!storedHash || typeof password !== "string" || !password) {
        return res.status(401).json({ error: "Invalid password" });
      }

      const valid = await bcrypt.compare(password, storedHash);
      if (!valid) return res.status(401).json({ error: "Invalid password" });

      (req.session as any).isAdmin = true;
      const token = computeAdminToken(storedHash);
      req.session.save((err) => {
        if (err) console.error('[Admin] Session save error:', err);
        res.json({ success: true, token });
      });
    } catch (error) {
      console.error("[Admin] Login failed");
      res.status(500).json({ error: "Login failed" });
    }
  });

}
