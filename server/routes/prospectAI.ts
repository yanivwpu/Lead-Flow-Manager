import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import {
  ProspectAiError,
  activateProspectAi,
  discoverProspects,
  getProspectAiActivity,
  getProspectAiStatus,
  sendDiscoverResultsToReview,
} from "../prospectAI/prospectAIService";
import {
  getProspectAiWonStats,
  getProspectOutcome,
  isProspectAiAttributed,
  listWonCustomers,
  markProspectAsWon,
  setProspectOutcome,
  type WonListFilter,
} from "../prospectAI/prospectAiOutcomeService";
import { isProspectAiOutcome } from "@shared/prospectAI";
import { storage } from "../storage";

function workspaceUserId(req: Request): string {
  return (req.user as { id: string }).id;
}

function handleProspectAiError(err: unknown, res: Response, logLabel: string): void {
  if (err instanceof ProspectAiError) {
    const body: Record<string, unknown> = { error: err.message, code: err.code };
    if (err.code === "upgrade_required") {
      body.upgradeRequired = true;
    }
    res.status(err.status).json(body);
    return;
  }
  console.error(`[ProspectAI] ${logLabel}:`, err);
  res.status(500).json({ error: "Unexpected Prospect AI error" });
}

export function registerProspectAiRoutes(app: Express): void {
  app.get(
    "/api/growth-engines/prospect-ai/status",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const status = await getProspectAiStatus(workspaceUserId(req));
        res.json(status);
      } catch (err) {
        handleProspectAiError(err, res, "status");
      }
    },
  );

  app.post(
    "/api/growth-engines/prospect-ai/activate",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const status = await activateProspectAi(workspaceUserId(req));
        res.json(status);
      } catch (err) {
        handleProspectAiError(err, res, "activate");
      }
    },
  );

  app.post(
    "/api/growth-engines/prospect-ai/discover",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const result = await discoverProspects(workspaceUserId(req), req.body);
        res.json(result);
      } catch (err) {
        handleProspectAiError(err, res, "discover");
      }
    },
  );

  app.post(
    "/api/growth-engines/prospect-ai/discover/:searchId/send-to-review",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const result = await sendDiscoverResultsToReview(
          workspaceUserId(req),
          String(req.params.searchId || ""),
          req.body?.resultIds,
        );
        res.json(result);
      } catch (err) {
        handleProspectAiError(err, res, "send-to-review");
      }
    },
  );

  app.get(
    "/api/growth-engines/prospect-ai/activity",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const activity = await getProspectAiActivity(workspaceUserId(req));
        res.json(activity);
      } catch (err) {
        handleProspectAiError(err, res, "activity");
      }
    },
  );

  app.get(
    "/api/growth-engines/prospect-ai/won/stats",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const stats = await getProspectAiWonStats(workspaceUserId(req), {
          timeRange: typeof req.query.filter === "string" ? req.query.filter : undefined,
          campaignEnrollmentId:
            typeof req.query.campaign === "string" ? req.query.campaign : undefined,
          teamMemberUserId:
            typeof req.query.markedBy === "string" ? req.query.markedBy : undefined,
        });
        res.json(stats);
      } catch (err) {
        handleProspectAiError(err, res, "won-stats");
      }
    },
  );

  app.get(
    "/api/growth-engines/prospect-ai/won/customers",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const filterRaw = String(req.query.filter || "all_time");
        const filter = (
          ["this_month", "last_30_days", "all_time"].includes(filterRaw)
            ? filterRaw
            : "all_time"
        ) as WonListFilter;
        const customers = await listWonCustomers({
          workspaceUserId: workspaceUserId(req),
          filter,
          campaignEnrollmentId: req.query.campaign
            ? String(req.query.campaign)
            : null,
          markedByUserId: req.query.markedBy ? String(req.query.markedBy) : null,
        });
        res.json({ customers });
      } catch (err) {
        handleProspectAiError(err, res, "won-customers");
      }
    },
  );

  app.get(
    "/api/growth-engines/prospect-ai/contacts/:contactId/outcome",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const wid = workspaceUserId(req);
        const contactId = String(req.params.contactId || "");
        const contact = await storage.getContact(contactId);
        if (!contact || contact.userId !== wid) {
          res.status(404).json({ error: "Contact not found" });
          return;
        }
        const attributed = isProspectAiAttributed(contact);
        const outcome = attributed ? await getProspectOutcome(wid, contactId) : null;
        res.json({
          attributed,
          outcome: outcome
            ? {
                prospectOutcome: outcome.prospectOutcome,
                wonAt: outcome.wonAt?.toISOString() ?? null,
                wonByUserId: outcome.wonByUserId,
                outcomeUpdatedAt: outcome.outcomeUpdatedAt?.toISOString() ?? null,
              }
            : null,
        });
      } catch (err) {
        handleProspectAiError(err, res, "get-outcome");
      }
    },
  );

  app.post(
    "/api/growth-engines/prospect-ai/contacts/:contactId/outcome",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const outcomeRaw = req.body?.outcome;
        if (!isProspectAiOutcome(outcomeRaw)) {
          res.status(400).json({ error: "Invalid outcome" });
          return;
        }
        const row = await setProspectOutcome({
          workspaceUserId: workspaceUserId(req),
          contactId: String(req.params.contactId || ""),
          outcome: outcomeRaw,
          actorUserId: workspaceUserId(req),
        });
        res.json({
          prospectOutcome: row.prospectOutcome,
          wonAt: row.wonAt?.toISOString() ?? null,
          wonByUserId: row.wonByUserId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to set outcome";
        if (/not found|not attributed/i.test(message)) {
          res.status(404).json({ error: message });
          return;
        }
        handleProspectAiError(err, res, "set-outcome");
      }
    },
  );

  app.post(
    "/api/growth-engines/prospect-ai/contacts/:contactId/mark-won",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const row = await markProspectAsWon({
          workspaceUserId: workspaceUserId(req),
          contactId: String(req.params.contactId || ""),
          actorUserId: workspaceUserId(req),
        });
        res.json({
          prospectOutcome: row.prospectOutcome,
          wonAt: row.wonAt?.toISOString() ?? null,
          wonByUserId: row.wonByUserId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to mark as won";
        if (/not found|not attributed/i.test(message)) {
          res.status(404).json({ error: message });
          return;
        }
        handleProspectAiError(err, res, "mark-won");
      }
    },
  );
}
