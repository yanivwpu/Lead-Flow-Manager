import assert from "node:assert/strict";
import test from "node:test";
import { resolveRgeGalleryState } from "../client/src/lib/growthEngineGalleryState";

test("maps server-backed Growth Engine states to honest actions", () => {
  assert.equal(resolveRgeGalleryState({ catalogStatus: "available", accessOk: true, hasPro: true }).action, "install");
  assert.equal(resolveRgeGalleryState({ catalogStatus: "available", accessOk: false, hasPro: false }).action, "upgrade");
  assert.equal(resolveRgeGalleryState({ catalogStatus: "available", entitlementStatus: "purchased", accessOk: true }).action, "continue_setup");
  assert.equal(resolveRgeGalleryState({ catalogStatus: "available", entitlementStatus: "installed", accessOk: true }).action, "manage");
  assert.equal(resolveRgeGalleryState({ catalogStatus: "available", entitlementStatus: "submitted", onboardingSubmittedAt: "2026-01-01", accessOk: true }).statusLabel, "Launch in progress");
});

test("paused installations keep their configuration and ask the user to restore Pro", () => {
  const state = resolveRgeGalleryState({ catalogStatus: "available", entitlementStatus: "installed", accessOk: false });
  assert.equal(state.action, "restore");
  assert.equal(state.label, "Restore Pro to resume");
  assert.equal(state.note, "Your configuration is saved.");
});

test("coming-soon and loading cards cannot be activated", () => {
  assert.equal(resolveRgeGalleryState({ catalogStatus: "coming_soon", accessOk: true }).disabled, true);
  assert.equal(resolveRgeGalleryState({ catalogStatus: "available", loading: true }).action, "loading");
});

test("an API error does not invent eligibility", () => {
  const state = resolveRgeGalleryState({ catalogStatus: "available", error: true });
  assert.equal(state.label, "View details");
  assert.match(state.note ?? "", /couldn't verify access/i);
});
