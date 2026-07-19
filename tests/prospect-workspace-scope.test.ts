/**
 * Workspace scoping helpers for Prospect AI / Import.
 * Run: npx tsx tests/prospect-workspace-scope.test.ts
 */
import assert from "node:assert/strict";
import { assertContactInWorkspace } from "../server/prospectImport/prospectWorkspaceScope";

assert.throws(
  () => assertContactInWorkspace(null, "ws-1"),
  /Prospect not found in this workspace/,
);

assert.throws(
  () => assertContactInWorkspace({ userId: "other" }, "ws-1"),
  /Prospect not found in this workspace/,
);

assert.doesNotThrow(() => assertContactInWorkspace({ userId: "ws-1" }, "ws-1"));

console.log("prospect-workspace-scope.test.ts: all assertions passed");
