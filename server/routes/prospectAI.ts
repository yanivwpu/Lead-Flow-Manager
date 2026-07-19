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
}
