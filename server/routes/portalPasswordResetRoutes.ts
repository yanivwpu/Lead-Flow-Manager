import type { Express, Request, Response } from "express";
import {
  allowPortalForgotRequest,
  completePortalPasswordReset,
  normalizePortalEmail,
  requestPortalPasswordReset,
  requestPortalPasswordResetByAccountId,
  type PortalResetAccountType,
} from "../portalPasswordReset";

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

function forgotHandler(accountType: PortalResetAccountType, neutralMessage: string) {
  return async (req: Request, res: Response) => {
    try {
      const email = normalizePortalEmail(req.body?.email);
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      const ip = clientIp(req);
      if (!allowPortalForgotRequest(`ip:${accountType}:${ip}`)) {
        return res.status(429).json({ error: "Too many requests. Please try again later." });
      }
      if (!allowPortalForgotRequest(`email:${accountType}:${email}`)) {
        // Still return neutral success to avoid enumeration.
        return res.json({ success: true, message: neutralMessage });
      }

      await requestPortalPasswordReset({ accountType, email });
      return res.json({ success: true, message: neutralMessage });
    } catch (err) {
      console.error(`[PORTAL_RESET] ${accountType} forgot-password error:`, (err as Error)?.message);
      return res.json({ success: true, message: neutralMessage });
    }
  };
}

function clearCurrentPortalSession(req: Request, accountType: PortalResetAccountType): void {
  const sess = req.session as unknown as {
    partnerId?: string;
    salespersonId?: string;
    save?: (cb: (err?: unknown) => void) => void;
  } | null;
  if (!sess) return;
  if (accountType === "partner") {
    delete sess.partnerId;
  } else {
    delete sess.salespersonId;
  }
  // Persist the cleared session if the store supports it.
  if (typeof sess.save === "function") {
    sess.save(() => undefined);
  }
}

function resetHandler(accountType: PortalResetAccountType) {
  return async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || req.body?.newPassword || "");
      const confirmPassword = String(req.body?.confirmPassword || "");

      if (!token || !password) {
        return res.status(400).json({ error: "Token and password are required" });
      }
      if (confirmPassword && confirmPassword !== password) {
        return res.status(400).json({ error: "Passwords do not match" });
      }

      const result = await completePortalPasswordReset({
        accountType,
        rawToken: token,
        newPassword: password,
      });
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      // Always clear this browser's portal auth; DB session purge covers other devices.
      clearCurrentPortalSession(req, accountType);
      return res.json({
        success: true,
        message: "Password updated successfully. You can now sign in.",
      });
    } catch (err) {
      console.error(`[PORTAL_RESET] ${accountType} reset-password error:`, (err as Error)?.message);
      return res.status(500).json({ error: "Failed to reset password" });
    }
  };
}

export function registerPortalPasswordResetRoutes(
  app: Express,
  requireAdmin: (req: any, res: any, next: any) => void,
): void {
  const partnerNeutral =
    "If a partner account exists for this email, we’ve sent password reset instructions.";
  const salesNeutral =
    "If a sales account exists for this email, we’ve sent password reset instructions.";

  app.post("/api/partner-portal/forgot-password", forgotHandler("partner", partnerNeutral));
  app.post("/api/partner-portal/reset-password", resetHandler("partner"));

  app.post("/api/sales-portal/forgot-password", forgotHandler("salesperson", salesNeutral));
  app.post("/api/sales-portal/reset-password", resetHandler("salesperson"));

  app.post(
    "/api/admin/partners/:id/send-password-reset",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const result = await requestPortalPasswordResetByAccountId({
          accountType: "partner",
          accountId: String(req.params.id || ""),
        });
        if (!result.ok) {
          return res.status(400).json({ error: result.error });
        }
        if (!result.emailSent) {
          return res.status(502).json({
            error: "Reset email could not be sent. Check email provider configuration.",
          });
        }
        return res.json({
          success: true,
          message: `Password reset email sent to ${result.email}`,
        });
      } catch (err) {
        console.error("[PORTAL_RESET] admin partner send error:", (err as Error)?.message);
        return res.status(500).json({ error: "Failed to send password reset email" });
      }
    },
  );

  app.post(
    "/api/admin/salespeople/:id/send-password-reset",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const result = await requestPortalPasswordResetByAccountId({
          accountType: "salesperson",
          accountId: String(req.params.id || ""),
        });
        if (!result.ok) {
          return res.status(400).json({ error: result.error });
        }
        if (!result.emailSent) {
          return res.status(502).json({
            error: "Reset email could not be sent. Check email provider configuration.",
          });
        }
        return res.json({
          success: true,
          message: `Password reset email sent to ${result.email}`,
        });
      } catch (err) {
        console.error("[PORTAL_RESET] admin sales send error:", (err as Error)?.message);
        return res.status(500).json({ error: "Failed to send password reset email" });
      }
    },
  );
}
