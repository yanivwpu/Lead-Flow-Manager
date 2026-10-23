import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual registered verification handler without loading app startup
// or accessing a database. Neither a mock signature nor this GET is live receipt evidence.
const source = ts.createSourceFile("routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
let handlerSource = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "get" && ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "/api/webhook/meta") handlerSource = node.arguments[1].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handlerSource, "existing webhook verification route must exist");
const handlerJs = ts.transpileModule(`(${handlerSource})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

test("valid and rejected verification challenges never log token values or prefixes", async () => {
  for (const valid of [true, false]) {
    const secret = "do-not-log-this-secret-verification-token";
    const supplied = valid ? secret : "invalid-but-still-private-verification-token";
    const logs: unknown[][] = [];
    const handler = vm.runInNewContext(handlerJs, {
      console: Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args: unknown[]) => logs.push(args)])),
      process: { env: { META_WEBHOOK_VERIFY_TOKEN: secret } },
      db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
      eq: () => true, users: { metaConnected: true }, channelSettings: { isConnected: true },
    });
    let status: number | null = null;
    let body: unknown;
    const res = { status(code: number) { status = code; return this; }, send(value: unknown) { body = value; return this; } };
    await handler({ query: { "hub.mode": "subscribe", "hub.verify_token": supplied, "hub.challenge": "challenge" } }, res);
    assert.equal(status, valid ? 200 : 403);
    assert.equal(body, valid ? "challenge" : "Verification failed");
    const logged = JSON.stringify(logs);
    assert.ok(logs.length > 0);
    assert.ok(!logged.includes(secret));
    assert.ok(!logged.includes(supplied));
    assert.ok(!logged.includes(supplied.slice(0, 8)));
  }
});
