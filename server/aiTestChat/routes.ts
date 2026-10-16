import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { CatalogDb } from "../salesCatalog/commerceStore";
import {
  createTestChatSessions,
  TestChatError,
  type TestOwner,
} from "./sessions";
import type { createTestChatGenerator } from "./generate";
export function registerTestChatRoutes(
  app: Express,
  deps: {
    db: CatalogDb;
    authorize: (req: Request, res: Response) => Promise<TestOwner | null>;
    access: (
      id: string,
      generating: boolean,
    ) => Promise<{ allowed: boolean; limited?: boolean }>;
    generate: ReturnType<typeof createTestChatGenerator>;
    diagnostics: (id: string) => Promise<unknown>;
  },
) {
  const sessions = createTestChatSessions(deps.db);
  function route(
    method: "get" | "post" | "delete",
    path: string,
    run: (auth: TestOwner, req: Request, res: Response) => Promise<unknown>,
  ) {
    app[method](path, async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      try {
        const auth = await deps.authorize(req, res);
        if (!auth) return;
        const access = await deps.access(
          auth.workspaceUserId,
          path.endsWith("/turn"),
        );
        if (!access.allowed)
          return res
            .status(access.limited ? 429 : 403)
            .json({
              error: access.limited
                ? "ai_temporarily_limited"
                : "ai_brain_required",
            });
        return await run(auth, req, res);
      } catch (error) {
        // No raw provider responses, prompts, tokens or customer data in API errors/logs.
        res
          .status(error instanceof TestChatError ? error.status : 503)
          .json({
            error:
              error instanceof TestChatError
                ? error.code
                : "test_chat_unavailable",
          });
      }
    });
  }
  route("post", "/api/ai/test-chat", async (auth, _req, res) =>
    res.json(await sessions.create(auth)),
  );
  route("get", "/api/ai/test-chat/:id", async (auth, req, res) =>
    res.json(await sessions.read(auth, req.params.id)),
  );
  route("get", "/api/ai/test-chat/:id/diagnostics", async (auth, req, res) => {
    await sessions.read(auth, req.params.id);
    return res.json(await deps.diagnostics(auth.workspaceUserId));
  });
  route("delete", "/api/ai/test-chat/:id", async (auth, req, res) => {
    await sessions.reset(auth, req.params.id);
    res.sendStatus(204);
  });
  route("post", "/api/ai/test-chat/:id/turn", async (auth, req, res) => {
    const input = z
      .object({
        eventId: z.string().uuid(),
        text: z.string().trim().min(1).max(4000),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return res.status(400).json({ error: "invalid_test_message" });
    return res.json(
      await sessions.turn(
        auth,
        req.params.id,
        input.data.eventId,
        input.data.text,
        ({ history, sessions: adapter }) =>
          deps.generate({
            userId: auth.workspaceUserId,
            sessionId: req.params.id,
            history,
            sessions: adapter,
          }),
      ),
    );
  });
}
