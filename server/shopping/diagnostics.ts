/** Allowlisted telemetry only. Never attach errors, IDs, prompts or model text. */
export type ShoppingFailureStage = "provider" | "json" | "schema" | "evidence" | "render" | "input_limit" | "output_limit";
export class ShoppingModelFailure extends Error {
  constructor(readonly stage: ShoppingFailureStage) { super(`shopping_${stage}_failure`); }
}
export type ShoppingAnswerDiagnostic = {
  event: "shopping_answer";
  outcome: "catalog_only" | "insufficient_evidence" | "grounded" | "failure";
  stage?: ShoppingFailureStage | "knowledge";
  action: "search" | "compare" | "variant" | "refine" | "clarify";
  locale: "en" | "es" | "he";
  choices: number;
  facts: number;
  policyFacts: number;
};
