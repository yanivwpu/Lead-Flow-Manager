/**
 * Production trace: published facts → routing → retrieval → grounding validation
 * for a pricing/inclusions email on Affordable Pompano (or --userId / --name).
 *
 * Usage:
 *   npx tsx scripts/audit-fact-grounding-reply.ts
 *   npx tsx scripts/audit-fact-grounding-reply.ts --message "..."
 *   npx tsx scripts/audit-fact-grounding-reply.ts --userId <uuid>
 *
 * Does not call the model. Reconstructs every pre-model and post-draft gate.
 */
import "dotenv/config";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../drizzle/db";
import { aiBusinessKnowledge, businessKnowledgeFacts, users } from "../shared/schema";
import { deriveSubIntents, resolveAiRouting } from "../shared/aiRouting";
import {
  detectFactConflicts,
  factFreshness,
  formatFactValue,
  parseKnowledgeFreshnessPolicy,
} from "../shared/businessKnowledgeFacts";
import {
  buildGroundedPromptBlock,
  validateGroundedClaims,
} from "../shared/factGrounding";
import { retrieveFactsForTurn } from "../shared/knowledgeRetrieval";
import { stripQuotedEmailReplies } from "../server/emailChannel/htmlSanitize";
import { knowledgeFactsActiveForWorkspace } from "../server/websiteKnowledge/knowledgeFlags";
import { listPublishedFacts, rowToKnowledgeFact } from "../server/websiteKnowledge/factStore";

const DEFAULT_MESSAGE =
  "Wonder about your business directory. How much is it and what is included in it?";

const GENERIC_DRAFT =
  "Our business directory listings are competitively priced to suit various needs and budgets. Could you share the type of business or service you're interested in advertising, so I can provide more specific details on pricing and inclusions?";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function resolveWorkspace(): Promise<{
  userId: string;
  businessName: string | null;
  email: string | null;
}> {
  const userIdArg = argValue("--userId");
  if (userIdArg) {
    const [k] = await db
      .select({
        userId: aiBusinessKnowledge.userId,
        businessName: aiBusinessKnowledge.businessName,
      })
      .from(aiBusinessKnowledge)
      .where(eq(aiBusinessKnowledge.userId, userIdArg))
      .limit(1);
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userIdArg))
      .limit(1);
    return {
      userId: userIdArg,
      businessName: k?.businessName ?? null,
      email: u?.email ?? null,
    };
  }

  const name = argValue("--name") || "Affordable Pompano";
  const rows = await db
    .select({
      userId: aiBusinessKnowledge.userId,
      businessName: aiBusinessKnowledge.businessName,
      email: users.email,
    })
    .from(aiBusinessKnowledge)
    .leftJoin(users, eq(users.id, aiBusinessKnowledge.userId))
    .where(
      or(
        ilike(aiBusinessKnowledge.businessName, `%${name}%`),
        ilike(aiBusinessKnowledge.displayName, `%${name}%`),
        ilike(aiBusinessKnowledge.publicWebsite, "%affordablepompano%"),
      ),
    )
    .limit(5);

  if (rows.length === 0) {
    throw new Error(`No workspace matched "${name}"`);
  }
  if (rows.length > 1) {
    console.log(
      "Multiple matches:",
      rows.map((r) => ({ userId: r.userId, businessName: r.businessName, email: r.email })),
    );
  }
  return {
    userId: rows[0].userId,
    businessName: rows[0].businessName,
    email: rows[0].email,
  };
}

async function main() {
  const messageArg = argValue("--message") || DEFAULT_MESSAGE;
  const draftArg = argValue("--draft") || GENERIC_DRAFT;
  const ws = await resolveWorkspace();

  console.log("\n=== WORKSPACE ===");
  console.log({ userId: ws.userId, businessName: ws.businessName, email: ws.email });

  const [knowledge] = await db
    .select()
    .from(aiBusinessKnowledge)
    .where(eq(aiBusinessKnowledge.userId, ws.userId))
    .limit(1);

  if (!knowledge) throw new Error("ai_business_knowledge row missing");

  const v2 = knowledge.knowledgeV2Enabled === true;
  const factsActive = knowledgeFactsActiveForWorkspace(knowledge);
  console.log("\n=== Q1 knowledge_v2_enabled ===");
  console.log({
    knowledgeV2Enabled: v2,
    AI_BRAIN_FACTS_DISABLED: process.env.AI_BRAIN_FACTS_DISABLED || null,
    factsActiveForWorkspace: factsActive,
  });

  const allRows = await db
    .select()
    .from(businessKnowledgeFacts)
    .where(eq(businessKnowledgeFacts.userId, ws.userId))
    .orderBy(desc(businessKnowledgeFacts.updatedAt));

  const byState = allRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.state] = (acc[r.state] || 0) + 1;
    return acc;
  }, {});

  console.log("\n=== Q4 fact states ===");
  console.log(byState);
  console.log(
    "draft with proposedAction:",
    allRows.filter((r) => r.state === "draft").map((r) => ({
      factKey: r.factKey,
      proposedAction: r.proposedAction,
      factType: r.factType,
    })),
  );

  const listingRows = allRows.filter(
    (r) =>
      /business.?listing/i.test(r.factKey) ||
      /business.?listing/i.test(JSON.stringify(r.data)),
  );
  console.log("\n=== Q2/Q3 Business Listing facts ===");
  for (const r of listingRows) {
    const parsed = rowToKnowledgeFact(r);
    console.log({
      id: r.id,
      factKey: r.factKey,
      state: r.state,
      proposedAction: r.proposedAction,
      conflictGroup: r.conflictGroup,
      conflictResolution: r.conflictResolution,
      lastVerifiedAt: r.lastVerifiedAt,
      publishedAt: r.publishedAt,
      data: r.data,
      formatted: parsed ? formatFactValue(parsed) : null,
    });
  }

  const published = await listPublishedFacts(ws.userId);
  const policy = parseKnowledgeFreshnessPolicy(knowledge.knowledgeFreshnessPolicy);
  const conflicts = detectFactConflicts(published);
  console.log("\n=== Q5 published freshness / conflicts ===");
  console.log({
    publishedCount: published.length,
    publishedKeys: published.map((f) => f.factKey),
    freshness: published.map((f) => ({
      factKey: f.factKey,
      tier: factFreshness(f, new Date(), policy).tier,
      lastVerifiedAt: f.lastVerifiedAt,
    })),
    blockedConflicts: conflicts.filter((c) => c.resolution === "blocked"),
  });

  const stripped = stripQuotedEmailReplies(messageArg);
  console.log("\n=== Q6 latest inbound (email strip) ===");
  console.log({ raw: messageArg, stripped });

  const routing = resolveAiRouting({
    inbound: stripped,
    joinedInbound: stripped,
    industry: knowledge.industry ?? undefined,
  });
  const subIntents = deriveSubIntents(stripped.toLowerCase());
  console.log("\n=== Q7 turnIntent / subIntents ===");
  console.log({
    turnIntent: routing.turnIntent,
    subIntents: routing.subIntents,
    deriveSubIntents: subIntents,
    decision: routing.decision,
    reason: routing.reason,
    signals: routing.signals,
  });

  console.log("\n=== Q8–Q14 grounding / retrieval / prompt ===");
  if (!factsActive) {
    console.log("FIRST FAILING STAGE: knowledgeFactsActiveForWorkspace — V2 off or kill switch");
    return;
  }
  if (published.length === 0) {
    console.log("FIRST FAILING STAGE: no published facts");
    return;
  }

  const retrieved = retrieveFactsForTurn({
    facts: published,
    message: stripped,
    subIntents: routing.subIntents,
    policy,
  });
  const conflictingKeys = conflicts
    .filter((c) => c.resolution === "blocked")
    .map((c) => c.factKey);
  const block = buildGroundedPromptBlock(retrieved, { conflictingKeys });

  console.log({
    retrievedCount: retrieved.length,
    retrievedIds: retrieved.map((r) => r.fact.id),
    retrievedKeys: retrieved.map((r) => r.fact.factKey),
    includesBusinessListing: retrieved.some((r) => r.fact.factKey === "pricing_plan:business-listing"),
    coveredTypes: block.coveredTypes,
    factCount: block.factCount,
    hasVerifiedHeader: block.text.includes("VERIFIED BUSINESS FACTS"),
    hasAnswerFirst: block.text.includes("ANSWER WITH VERIFIED FACTS FIRST"),
  });
  console.log("\n--- sanitized facts block ---\n");
  console.log(block.text || "(empty)");

  console.log("\n=== Q15–Q17 validate production draft ===");
  const check = validateGroundedClaims({
    draft: draftArg,
    retrieved,
    subIntents: routing.subIntents,
  });
  console.log({
    draft: draftArg,
    ok: check.ok,
    violations: check.violations,
  });

  if (check.ok && retrieved.some((r) => r.fact.factType === "pricing_plan")) {
    console.log(
      "\nFIRST FAILING STAGE: validateGroundedClaims — incomplete generic pricing answer is allowed (no missing-price / missing-benefits check)",
    );
  } else if (!check.ok) {
    console.log("\nValidation would block. First violation:", check.violations[0]);
  } else if (retrieved.length === 0) {
    console.log("\nFIRST FAILING STAGE: retrieveFactsForTurn — no facts retrieved for turn");
  }

  // Also show whether "included" is classified as benefits today
  console.log("\n=== classification gap check ===");
  console.log({
    messageHasIncluded: /included/i.test(stripped),
    benefitsInSubIntents: routing.subIntents.includes("benefits_question"),
    listingJoinInSubIntents: routing.subIntents.includes("listing_join_question"),
    pricingInSubIntents: routing.subIntents.includes("pricing_question"),
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
