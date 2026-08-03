/**
 * Prospect AI worker startup key gate + foreign deployment detection.
 * Run: npx tsx tests/prospect-ai-worker-startup-guard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeOpenAiKeyRuntimeDiagnostics,
  detectForeignProspectAiDeployment,
  shouldStartProspectAiBulkWorker,
} from "../shared/prospectAiReliability";

const root = process.cwd();

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

run("worker starts only with validated sk- OpenAI key", () => {
  const good = describeOpenAiKeyRuntimeDiagnostics({
    OPENAI_API_KEY: "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789",
    RESEND_API_KEY: "re_abcdefghijklmnopqrstuv",
    RAILWAY_PROJECT_NAME: "luminous-transformation",
    RAILWAY_SERVICE_NAME: "Lead-Flow-Manager",
    RAILWAY_DEPLOYMENT_ID: "dep-good",
  } as NodeJS.ProcessEnv);
  assert.equal(good.prefixClass, "sk-");
  assert.equal(good.resendKeyPrefixClass, "re_");
  assert.equal(good.ok, true);
  assert.deepEqual(shouldStartProspectAiBulkWorker(good), { start: true });

  const resend = describeOpenAiKeyRuntimeDiagnostics({
    OPENAI_API_KEY: "re_abcdefghijklmnopqrstuv",
  } as NodeJS.ProcessEnv);
  const blockedResend = shouldStartProspectAiBulkWorker(resend);
  assert.equal(blockedResend.start, false);
  if (!blockedResend.start) {
    assert.match(blockedResend.reason, /Resend|re_/i);
  }

  const missing = describeOpenAiKeyRuntimeDiagnostics({} as NodeJS.ProcessEnv);
  const blockedMissing = shouldStartProspectAiBulkWorker(missing);
  assert.equal(blockedMissing.start, false);
  if (!blockedMissing.start) {
    assert.match(blockedMissing.reason, /missing/i);
  }
});

run("foreign deployment detector flags other deploy ids", () => {
  assert.deepEqual(
    detectForeignProspectAiDeployment({
      currentDeploymentId: "dep-a",
      recentDeploymentIds: ["dep-a", "dep-a"],
    }),
    { foreignDetected: false, foreignDeploymentIds: [] },
  );
  assert.deepEqual(
    detectForeignProspectAiDeployment({
      currentDeploymentId: "dep-a",
      recentDeploymentIds: ["dep-a", "dep-b", "", null, "dep-b"],
    }),
    { foreignDetected: true, foreignDeploymentIds: ["dep-b"] },
  );
});

run("worker wires startup block + ownership logs", () => {
  const src = readFileSync(
    join(root, "server/prospectImport/prospectBulkAnalysisWorker.ts"),
    "utf8",
  );
  assert.ok(src.includes("shouldStartProspectAiBulkWorker"));
  assert.ok(src.includes("worker_start_blocked"));
  assert.ok(src.includes("REFUSED TO START"));
  assert.ok(src.includes("railwayProjectName"));
  assert.ok(src.includes("railwayDeploymentId"));
  assert.ok(src.includes("resendKeyPrefixClass"));
  assert.ok(src.includes("foreign_deployment_warning"));
  assert.ok(src.includes("detectForeignProspectAiDeployment"));
  // Must not log raw secrets.
  assert.equal(src.includes("console.log(process.env.OPENAI_API_KEY)"), false);
  assert.equal(src.includes("console.error(process.env.OPENAI_API_KEY)"), false);
});

console.log("prospect-ai-worker-startup-guard.test.ts: all assertions passed");
