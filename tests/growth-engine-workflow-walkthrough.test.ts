import assert from "node:assert/strict";
import test from "node:test";
import { realtorWorkflowWalkthrough, workflowLocale } from "../client/src/components/growthEngines/workflowWalkthroughConfig";

test("every example route references real nodes and has one caption per step", () => {
  const ids = new Set(realtorWorkflowWalkthrough.nodes.map((node) => node.id));
  for (const route of realtorWorkflowWalkthrough.routes) {
    assert.ok(route.nodeIds.length > 1);
    route.nodeIds.forEach((id) => assert.ok(ids.has(id), `${route.id} references missing ${id}`));
    for (const locale of ["en", "es", "he"] as const) {
      assert.equal(route.captions[locale].length, route.nodeIds.length, `${route.id}/${locale}`);
      assert.ok(route.label[locale]);
    }
  }
});

test("the verified routes do not claim an unsupported title-provider branch", () => {
  assert.deepEqual(realtorWorkflowWalkthrough.routes.map((route) => route.id), ["viewing", "finance", "moving", "nurture"]);
  assert.equal(realtorWorkflowWalkthrough.nodes.some((node) => node.id === "title"), false);
});

test("locale selection supports English, Spanish, Hebrew and regional variants", () => {
  assert.equal(workflowLocale("es-MX"), "es");
  assert.equal(workflowLocale("he-IL"), "he");
  assert.equal(workflowLocale("fr"), "en");
});
