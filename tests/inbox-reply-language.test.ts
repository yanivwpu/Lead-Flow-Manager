import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the shared Suggest and Auto endpoint never uses the account UI locale", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const handler = routes.slice(routes.indexOf('app.post("/api/ai/suggest-reply"')).split(/\n  app\.(?:get|post|patch)\(/)[0];
  assert.match(handler, /requestedMode === 'auto'/);
  assert.doesNotMatch(handler, /req\.user\.language/);
  assert.match(handler, /resolveInboxReplyLanguage\(/);
});

import { resolveInboxReplyLanguage } from "../shared/inboxReplyLanguage";

const cases = [
  ["he", "Could you send the price for this property?", "en"],
  ["he", "Quiero información sobre el precio.", "es"],
  ["es", "אני מחפש דירה באזור הזה", "he"],
  ["en", "¿Cuánto cuesta el envío?", "es"],
] as const;
for (const [ui, content, expected] of cases) {
  test(`${ui} interface, ${expected} customer`, () => {
    const history = [{ role: "user", content }];
    for (const aiMode of ["suggest", "auto"]) {
      const request = { ui, aiMode, explicit: undefined, history };
      assert.equal(resolveInboxReplyLanguage(request), expected);
      const changedUI = { ...request, ui: ui === "en" ? "he" : "en" };
      assert.equal(resolveInboxReplyLanguage(changedUI), expected);
    }
  });
}

test("ambiguous and mixed-language turns use earlier customer context, never an agent draft", () => {
  const history = [
    { role: "user", content: "¿Tienes más información?" },
    { role: "assistant", content: "הנה המידע שביקשת" },
    { role: "user", content: "OK 👍" },
  ];
  assert.equal(resolveInboxReplyLanguage({ explicit: undefined, history }), "es");
  history[2] = { role: "user", content: "אני רוצה פרטים על המחיר of this property" };
  assert.equal(resolveInboxReplyLanguage({ explicit: undefined, history }), "he");
  assert.equal(resolveInboxReplyLanguage({ explicit: undefined, history: [{ role: "user", content: "OK" }] }), "en");
});

test("explicit reply language beats an established conversation language, which beats detection", () => {
  const context = { conversationLanguage: "he", history: [{ role: "user", content: "¿Cuál es el precio?" }] };
  assert.equal(resolveInboxReplyLanguage({ ...context, explicit: "en" }), "en");
  assert.equal(resolveInboxReplyLanguage({ ...context, explicit: "bad value" }), "he");
});

test("language detection ignores URLs, email addresses and long unbroken tokens", () => {
  const history = [
    { role: "user", content: "¿Cuánto cuesta el envío?" },
    { role: "user", content: "OK https://example.invalid/שלום שלום@example.invalid " + "x".repeat(100_000) },
  ];
  assert.equal(resolveInboxReplyLanguage({ explicit: undefined, history }), "es");
  history[1].content = "אני מחפש דירה באזור הזה https://example.invalid/precio";
  assert.equal(resolveInboxReplyLanguage({ explicit: undefined, history }), "he");
});
