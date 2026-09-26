import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("development preview renders real components behind a DEV guard", () => {
  const html = readFileSync("client/growth-engines-preview.html", "utf8");
  const preview = readFileSync("client/src/dev/GrowthEnginesPreview.tsx", "utf8");

  assert.match(html, /src\/dev\/GrowthEnginesPreview\.tsx/);
  assert.match(preview, /import\.meta\.env\.DEV/);
  assert.match(preview, /GrowthEngineGalleryCard/);
  assert.match(preview, /WorkflowWalkthrough/);
  assert.doesNotMatch(preview, /fetch\(|apiRequest|useAuth/);
});

test("preview includes the requested entitlement and localization fixtures", () => {
  const preview = readFileSync("client/src/dev/GrowthEnginesPreview.tsx", "utf8");

  for (const state of ["Free", "Pro / trial", "Setup incomplete", "Installed", "Expired Pro", "Coming soon"]) {
    assert.ok(preview.includes(state), `missing ${state} fixture`);
  }
  assert.match(preview, /\["en", "es", "he"\]/);
  assert.match(preview, /locale === "he" \? "rtl" : "ltr"/);
});
