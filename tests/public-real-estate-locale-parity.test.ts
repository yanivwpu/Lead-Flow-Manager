import assert from "node:assert/strict";
import test from "node:test";
import { publicRealEstateCopy, publicRealEstateText } from "../shared/agent/publicRealEstateLocale";

test("public real estate copy has nonempty EN, HE and ES text and matching placeholders", () => {
  const placeholders = (value: string) =>
    [...value.matchAll(/\{(\w+)\}/g)].map(([, key]) => key).sort();
  assert.ok(Object.keys(publicRealEstateCopy).length > 0);
  for (const [key, copy] of Object.entries(publicRealEstateCopy)) {
    assert.ok(key.trim());
    assert.deepEqual(Object.keys(copy).sort(), ["es", "he"], key);
    for (const [locale, translated] of Object.entries(copy)) {
      assert.ok(translated.trim(), `${locale} must have text for ${key}`);
      assert.deepEqual(placeholders(translated), placeholders(key), `${locale} must preserve variables for ${key}`);
    }
  }
  assert.equal(publicRealEstateText(undefined, "For Sale"), "For Sale");
  assert.equal(publicRealEstateText("fr", "For Sale"), "For Sale");
});
