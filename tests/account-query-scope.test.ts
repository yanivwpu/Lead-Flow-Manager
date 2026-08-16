/**
 * Account-scoped React Query keys + cache isolation.
 * Run: npx tsx --test tests/account-query-scope.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  privateAccountUiAllowed,
  resetAccountQueryCache,
  resolveAuthIdentityGate,
  resolveQueryRequestUrl,
  sessionIdentitiesMatch,
  withUserQueryScope,
} from "../client/src/lib/accountQueryScope";

const ACCOUNT_A = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";
const ACCOUNT_B = "2e311869-a443-454c-8da9-fa8ef4dd191e";

test("user scope is stripped from fetch URLs", () => {
  assert.equal(resolveQueryRequestUrl(withUserQueryScope(["/api/channels"], ACCOUNT_A)), "/api/channels");
  assert.equal(
    resolveQueryRequestUrl(withUserQueryScope(["/api/integrations", "meta-webhook-config"], ACCOUNT_A)),
    "/api/integrations/meta-webhook-config",
  );
  assert.equal(
    resolveQueryRequestUrl(["/api/conversations", "conv-1", "messages", "user:" + ACCOUNT_A]),
    "/api/conversations/conv-1/messages",
  );
});

test("Account A and Account B channel caches never share an entry", () => {
  const qc = new QueryClient();
  const keyA = withUserQueryScope(["/api/channels"], ACCOUNT_A);
  const keyB = withUserQueryScope(["/api/channels"], ACCOUNT_B);
  qc.setQueryData(keyA, [
    { channel: "instagram", isConnected: true, config: { pageName: "whachatcrm" } },
  ]);
  assert.equal(qc.getQueryData(keyB), undefined);
  assert.notDeepEqual(keyA, keyB);
});

test("logout/identity change clears Account A cache before Account B can read it", () => {
  const qc = new QueryClient();
  const keyA = withUserQueryScope(["/api/channels"], ACCOUNT_A);
  const keyIntegrationsA = withUserQueryScope(["/api/integrations"], ACCOUNT_A);
  const keyActivationA = withUserQueryScope(["/api/activation-status"], ACCOUNT_A);
  qc.setQueryData(keyA, [
    { channel: "instagram", isConnected: true, config: { pageName: "whachatcrm" } },
  ]);
  qc.setQueryData(keyIntegrationsA, [{ type: "meta_instagram", id: "613aa710-5fff-4ea3-b12f-e5c8b68a2803" }]);
  qc.setQueryData(keyActivationA, { hasAnyMessagingChannel: true, instagramConnected: true });

  resetAccountQueryCache(qc);

  assert.equal(qc.getQueryData(keyA), undefined);
  assert.equal(qc.getQueryData(keyIntegrationsA), undefined);
  assert.equal(qc.getQueryData(keyActivationA), undefined);
  assert.equal(qc.getQueryData(withUserQueryScope(["/api/channels"], ACCOUNT_B)), undefined);
});

test("session identity gate blocks private UI on mismatch", () => {
  assert.equal(
    resolveAuthIdentityGate({ isLoading: true, clientUserId: ACCOUNT_A, serverConfirmedUserId: ACCOUNT_B }),
    "unknown",
  );
  assert.equal(
    resolveAuthIdentityGate({ isLoading: false, clientUserId: ACCOUNT_A, serverConfirmedUserId: ACCOUNT_A }),
    "match",
  );
  assert.equal(
    resolveAuthIdentityGate({ isLoading: false, clientUserId: ACCOUNT_A, serverConfirmedUserId: ACCOUNT_B }),
    "mismatch",
  );
  assert.equal(
    resolveAuthIdentityGate({ isLoading: false, clientUserId: null, serverConfirmedUserId: null }),
    "signed_out",
  );
  assert.equal(
    privateAccountUiAllowed(
      resolveAuthIdentityGate({ isLoading: false, clientUserId: ACCOUNT_A, serverConfirmedUserId: ACCOUNT_B }),
    ),
    false,
  );
  assert.equal(sessionIdentitiesMatch(ACCOUNT_A, ACCOUNT_B), false);
  assert.equal(sessionIdentitiesMatch(ACCOUNT_A, ACCOUNT_A), true);
});
