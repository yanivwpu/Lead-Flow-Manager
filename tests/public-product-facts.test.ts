/** Run: npx tsx --test tests/public-product-facts.test.ts */
import assert from "node:assert/strict";
import test from "node:test";
import { planIncludesAIBrain, growthEngineEligibleForPlan } from "../shared/aiBrainEntitlement";
import {
  REALTOR_GROWTH_ENGINE_ONETIME_USD,
  REALTOR_GROWTH_ENGINE_PATH,
  getFreePlanMonthlyPriceUsd,
  getPaidPlanMonthlyPriceUsd,
  getPaidPlanYearlyPriceUsd,
} from "../shared/pricingEntitlements";
import { CANONICAL_HOST } from "../shared/localeRoutes";
import { PLAN_LIMITS } from "../shared/schema";
import { PRO_AI_TRIAL_DAYS } from "../shared/trialPolicy";
import {
  PRODUCT_AVAILABILITY_STATES,
  PRODUCT_IMPLEMENTATION_STATES,
  PRODUCT_LIFECYCLE_STATES,
  PUBLIC_PRODUCT_CANONICAL_HOST,
  PUBLIC_PRODUCT_FACTS,
  PUBLIC_PRO_AI_TRIAL_DAYS,
  PUBLIC_REALTOR_GROWTH_ENGINE_REQUIREMENT,
} from "../shared/publicProductFacts";

const facts = Object.values(PUBLIC_PRODUCT_FACTS);

function amount(id: keyof typeof PUBLIC_PRODUCT_FACTS, period: "month" | "year" | "once") {
  return PUBLIC_PRODUCT_FACTS[id].prices.find((price) => price.billingPeriod === period)?.amount;
}

test("public facts reference canonical prices, limits, host, route, and trial", () => {
  assert.equal(amount("free", "month"), getFreePlanMonthlyPriceUsd());
  assert.equal(amount("free", "month"), PLAN_LIMITS.free.price);
  assert.equal(amount("pro", "month"), getPaidPlanMonthlyPriceUsd("pro"));
  assert.equal(amount("pro", "year"), getPaidPlanYearlyPriceUsd("pro"));
  assert.equal(amount("realtorGrowthEngine", "once"), REALTOR_GROWTH_ENGINE_ONETIME_USD);
  assert.equal(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.publicRoute, REALTOR_GROWTH_ENGINE_PATH);
  assert.equal(PUBLIC_PRODUCT_CANONICAL_HOST, CANONICAL_HOST);
  assert.equal(PUBLIC_PRO_AI_TRIAL_DAYS, PRO_AI_TRIAL_DAYS);
  assert.deepEqual(PUBLIC_PRODUCT_FACTS.free.limits, {
    conversationsPerPeriod: PLAN_LIMITS.free.conversationsPerMonth,
    maxUsers: PLAN_LIMITS.free.maxUsers,
    maxWhatsappNumbers: PLAN_LIMITS.free.maxWhatsappNumbers,
  });
});

test("Free and Pro are the only current public self-service plans", () => {
  assert.deepEqual(
    facts.filter((fact) => fact.publicSelfService && fact.currentPurchasableOffer).map((fact) => fact.id).sort(),
    ["free", "pro"],
  );
});

test("AI Brain and RGE facts match entitlement enforcement", () => {
  assert.equal(PUBLIC_PRODUCT_FACTS.aiBrain.currentPurchasableOffer, false);
  assert.deepEqual(PUBLIC_PRODUCT_FACTS.aiBrain.includedWith, ["pro"]);
  assert.equal(planIncludesAIBrain("pro"), true);
  assert.equal(planIncludesAIBrain("free"), false);
  assert.equal(growthEngineEligibleForPlan("pro"), true);
  assert.match(PUBLIC_REALTOR_GROWTH_ENGINE_REQUIREMENT, /active Pro plan/i);
  assert.deepEqual(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.requires, ["pro"]);
});

test("legacy commercial states are deprecated enforcement only", () => {
  for (const fact of [PUBLIC_PRODUCT_FACTS.starter, PUBLIC_PRODUCT_FACTS.legacyAiBrainAddon]) {
    assert.equal(fact.availability, "deprecated");
    assert.equal(fact.legacyEnforcementOnly, true);
    assert.equal(fact.currentPurchasableOffer, false);
    assert.equal(fact.publicSelfService, false);
    assert.deepEqual(fact.prices, []);
  }
});

test("lifecycle vocabularies distinguish every required state", () => {
  assert.deepEqual(PRODUCT_IMPLEMENTATION_STATES, ["implemented", "beta", "coming_soon"]);
  assert.deepEqual(PRODUCT_AVAILABILITY_STATES, ["public", "allowlisted", "internal", "deprecated"]);
  assert.deepEqual(PRODUCT_LIFECYCLE_STATES, [
    "implemented",
    "public",
    "beta",
    "allowlisted",
    "coming_soon",
    "internal",
    "deprecated",
  ]);
});
