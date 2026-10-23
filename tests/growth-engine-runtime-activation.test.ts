import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://fixture:fixture@127.0.0.1:5432/fixture";
const { storage } = await import("../server/storage");
const { subscriptionService } = await import("../server/subscriptionService");
const { executeWorkflowActions } = await import("../server/workflowEngine");
const { processAutomationTimerJob } = await import("../server/automationTimerHandlers");

test("RGE workflow actions require completed activation in the same workspace", async () => {
  const originals = new Map<string, any>();
  const replace = (name: string, fn: any) => { originals.set(name, (storage as any)[name]); (storage as any)[name] = fn; };
  const originalLimits = subscriptionService.getUserLimits;
  let installation: any;
  let writes = 0;
  let installReads = 0;
  const logs: any[] = [];
  replace("getUserForSession", async () => ({ id: "workspace-a" }));
  replace("getTemplateInstall", async (userId: string, templateId: string) => {
    installReads++; assert.equal(userId, "workspace-a"); assert.equal(templateId, "realtor-growth-engine"); return installation;
  });
  replace("updateConversation", async () => { writes++; return {}; });
  replace("incrementWorkflowExecution", async () => {});
  replace("logWorkflowExecution", async (row: any) => { logs.push(row); return row; });
  (subscriptionService as any).getUserLimits = async () => ({ plan: "pro", workflowsEnabled: true, hasAIBrainAddon: true });
  const workflow = { id: "fixture-rge", userId: "workspace-a", name: "Fixture", isActive: true,
    description: null, triggerConditions: { templateId: "realtor-growth-engine" },
    actions: [{ type: "set_status", value: "pending" }] } as any;
  try {
    for (const row of [undefined, { userId: "workspace-a", templateId: "realtor-growth-engine", installStatus: "pending" },
      { userId: "workspace-a", templateId: "realtor-growth-engine", installStatus: "failed" },
      { userId: "workspace-b", templateId: "realtor-growth-engine", installStatus: "installed" }]) {
      installation = row;
      const result = await executeWorkflowActions(workflow, null, {}, undefined, "fixture-conversation");
      assert.equal(result.success, false, "Pro eligibility or another workspace's installation cannot activate RGE");
      assert.equal(writes, 0);
      assert.deepEqual(result.actionsExecuted, []);
      assert.equal(logs.at(-1).triggerData.denialReason, "workspace_not_activated");
    }
    installation = { userId: "workspace-a", templateId: "realtor-growth-engine", installStatus: "installed" };
    assert.equal((await executeWorkflowActions(workflow, null, {}, undefined, "fixture-conversation")).success, true);
    assert.equal(writes, 1);
    installation = undefined;
    assert.equal((await executeWorkflowActions({ ...workflow, triggerConditions: {}, description: "Realtor Growth Engine: legacy" }, null, {}, undefined, "fixture-conversation")).success, false);
    assert.equal(writes, 1, "legacy workflow must stop after its installation is removed");
    const beforeGeneral = installReads;
    assert.equal((await executeWorkflowActions({ ...workflow, description: null, triggerConditions: {} }, null, {}, undefined, "fixture-conversation")).success, true);
    assert.equal(writes, 2, "ordinary entitled automation remains usable");
    assert.equal(installReads, beforeGeneral, "ordinary workflow does not depend on RGE installation");
    const templateFallback = await executeWorkflowActions({ ...workflow, description: null, triggerConditions: {},
      actions: [{ type: "send_message_template", templateKey: "followup_24h" }] }, null, {},
      { id: "fixture-contact", userId: "workspace-a" } as any, "fixture-conversation");
    assert.equal(templateFallback.success, false, "missing metadata must not bypass RGE template activation");
    assert.equal(templateFallback.blockedReason, "workspace_not_activated");
    assert.equal(writes, 2);
  } finally {
    subscriptionService.getUserLimits = originalLimits;
    for (const [name, original] of originals) (storage as any)[name] = original;
  }
});

test("queued W2 qualification and routing cannot send after workspace activation is absent", async () => {
  const originalLimits = subscriptionService.getUserLimits;
  const names = ["getUserForSession", "getTemplateInstall", "getContact", "markAutomationTimerJobSkipped"] as const;
  const originals = new Map(names.map(name => [name, (storage as any)[name]]));
  const skipped: string[] = [];
  (subscriptionService as any).getUserLimits = async () => ({ plan: "pro", workflowsEnabled: true });
  (storage as any).getUserForSession = async () => ({ id: "workspace-a" });
  (storage as any).getTemplateInstall = async () => undefined;
  (storage as any).getContact = async () => { throw Error("timer reached contact/send path without activation"); };
  (storage as any).markAutomationTimerJobSkipped = async (_id: string, reason: string) => { skipped.push(reason); };
  try {
    for (const kind of ["w2_qualification", "w2_routing"]) {
      await processAutomationTimerJob({ id: "fixture-timer", userId: "workspace-a", kind,
        payload: { contactId: "fixture-contact" } } as any);
    }
    assert.deepEqual(skipped, ["workspace_not_activated", "workspace_not_activated"]);
  } finally {
    subscriptionService.getUserLimits = originalLimits;
    for (const [name, original] of originals) (storage as any)[name] = original;
  }
});
