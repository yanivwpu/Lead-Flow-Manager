import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDiagnosticTypeProperties as normalize } from "../scripts/typecheck-diagnostic-normalization.mjs";
test("diagnostic comparison ignores property order but preserves type/property/code changes", () => {
  const one = "error TS2345: { amount: number; currency: string; billingPeriod: string; }";
  const reordered = "error TS2345: { currency: string; billingPeriod: string; amount: number; }";
  assert.equal(normalize(one), normalize(reordered));
  assert.notEqual(normalize(one), normalize(one.replace("number", "boolean")));
  assert.notEqual(normalize(one), normalize(one.replace("currency", "newCurrency")));
  assert.notEqual(normalize(one), normalize(one.replace("2345", "9999")));
  assert.equal(normalize('Type "week" | "month"'), normalize('Type "month" | "week"'));
  assert.notEqual(normalize('Type "week" | "month"'), normalize('Type "year" | "month"'));
  assert.equal(normalize("unexpected { non-type }"), "unexpected { non-type }");
});
