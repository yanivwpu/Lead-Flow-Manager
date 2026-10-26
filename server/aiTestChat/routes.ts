import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { CatalogDb } from "../salesCatalog/commerceStore";
import {
  createTestChatSessions,
  TestChatError,
  type TestOwner,
} from "./sessions";
import type { createTestChatGenerator } from "./generate";
import type { PrivateCheckoutPreflight } from "@shared/aiTestChat";
export type PrivateTestTurnDiagnostic = {
  workspaceUserId: string; sessionId: string; eventId: string;
  step: string | null; intent: string | null; choicesCount: number;
  selectedVariantId: string | null; lastProofAt: string | null;
};
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
    checkoutPreflight?: (auth: TestOwner, id: string, httpSessionId: string) => Promise<PrivateCheckoutPreflight>;
    checkoutHandoffInspect?: (auth: TestOwner, id: string, httpSessionId: string) => Promise<unknown>;
    checkoutHandoffPrepare?: (auth: TestOwner, id: string, httpSessionId: string) => Promise<unknown>;
    onTurnSaved?: (event: PrivateTestTurnDiagnostic) => void | Promise<void>;
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
  if (deps.checkoutPreflight) route("post", "/api/ai/test-chat/:id/checkout-preflight", async (auth, req, res) => {
    res.set({"Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});
    if (!req.sessionID) throw new TestChatError(403,"authenticated_session_required");
    if (!req.is("application/json") || req.get("sec-fetch-site")==="cross-site")
      throw new TestChatError(403,"same_origin_json_required");
    if (!z.object({}).strict().safeParse(req.body).success)
      throw new TestChatError(400,"invalid_checkout_preflight");
    return res.json(await deps.checkoutPreflight!(auth,req.params.id,req.sessionID));
  });
  if (deps.checkoutHandoffInspect) route("get", "/api/ai/test-chat/:id/checkout-handoff-request", async (auth,req,res)=>{
    res.set({"Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});
    if(!req.sessionID)throw new TestChatError(403,"authenticated_session_required");
    if(req.get("sec-fetch-site")==="cross-site")throw new TestChatError(403,"same_origin_required");
    return res.json(await deps.checkoutHandoffInspect!(auth,req.params.id,req.sessionID));
  });
  // Preparation only. No approve/create/execute endpoint is registered in this milestone.
  if (deps.checkoutHandoffPrepare) route("post", "/api/ai/test-chat/:id/checkout-handoff-request", async (auth, req, res) => {
    res.set({"Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});
    if (!req.sessionID) throw new TestChatError(403,"authenticated_session_required");
    if (!req.is("application/json") || req.get("sec-fetch-site")==="cross-site")
      throw new TestChatError(403,"same_origin_json_required");
    if (!z.object({}).strict().safeParse(req.body).success)
      throw new TestChatError(400,"invalid_checkout_handoff_request");
    return res.json(await deps.checkoutHandoffPrepare!(auth,req.params.id,req.sessionID));
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
    const view = await sessions.turn(
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
      );
    // Only committed state and opaque correlation IDs. Never pass prompts,
    // transcripts, customer data, provider responses or credentials to logging.
    try {
      await deps.onTurnSaved?.({
        workspaceUserId: auth.workspaceUserId, sessionId: view.id, eventId: input.data.eventId,
        step: view.state.step ?? null, intent: view.state.intent ?? null,
        choicesCount: view.state.choices?.length ?? 0,
        selectedVariantId: view.state.selected?.variantId ?? null,
        lastProofAt: view.state.selected?.verifiedAt ?? view.state.choices?.[0]?.verifiedAt ?? null,
      });
    } catch { /* A diagnostic failure cannot change a committed test turn. */ }
    return res.json(view);
  });
}
