/**
 * Audit call_to_action / booking / contact / pricing planUrl facts for a workspace.
 * Usage: npx tsx scripts/audit-next-action-facts.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  aiBusinessKnowledge,
  aiWebsiteKnowledgeSources,
  businessKnowledgeFacts,
} from "../shared/schema";
import { formatFactValue } from "../shared/businessKnowledgeFacts";
import { rowToKnowledgeFact } from "../server/websiteKnowledge/factStore";
import { retrieveFactsForTurn } from "../shared/knowledgeRetrieval";
import { resolveAiRouting } from "../shared/aiRouting";
import { knowledgeFactsActiveForWorkspace } from "../server/websiteKnowledge/knowledgeFlags";

const USER_ID = "9c1e65d2-2132-4436-8884-925356161cf9";
const MSG =
  "Wonder about your business directory. How much is it and what is included in it?";

async function main() {
  const [knowledge] = await db
    .select()
    .from(aiBusinessKnowledge)
    .where(eq(aiBusinessKnowledge.userId, USER_ID))
    .limit(1);

  console.log("=== V2 / booking ===", {
    knowledgeV2Enabled: knowledge?.knowledgeV2Enabled,
    factsActive: knowledgeFactsActiveForWorkspace(knowledge),
    bookingLink: knowledge?.bookingLink,
  });

  const sources = await db
    .select()
    .from(aiWebsiteKnowledgeSources)
    .where(eq(aiWebsiteKnowledgeSources.userId, USER_ID));
  console.log("\n=== SOURCES ===");
  for (const s of sources) {
    console.log({
      url: s.url,
      detectedType: s.detectedType,
      status: s.status,
      title: s.title,
      customLabel: s.customLabel,
    });
  }

  const rows = await db
    .select()
    .from(businessKnowledgeFacts)
    .where(eq(businessKnowledgeFacts.userId, USER_ID));

  const actionTypes = new Set([
    "call_to_action",
    "booking_link",
    "contact_method",
    "pricing_plan",
    "eligibility_rule",
    "custom_fact",
  ]);

  console.log("\n=== ACTION-RELATED FACTS ===");
  for (const r of rows.filter((x) => actionTypes.has(x.factType))) {
    const parsed = rowToKnowledgeFact(r);
    console.log({
      factType: r.factType,
      factKey: r.factKey,
      state: r.state,
      proposedAction: r.proposedAction,
      sourceUrl: r.sourceUrl,
      data: r.data,
      formatted: parsed ? formatFactValue(parsed) : null,
    });
  }

  console.log("\n=== CTA/FORM SEARCH ===");
  for (const r of rows) {
    const blob = `${r.factKey} ${JSON.stringify(r.data)} ${r.sourceUrl || ""}`;
    if (/apply|application|form|cta|call.to.action|advertis|1.?2.?business|within/i.test(blob)) {
      console.log({
        factType: r.factType,
        factKey: r.factKey,
        state: r.state,
        sourceUrl: r.sourceUrl,
        data: r.data,
      });
    }
  }

  const published = rows
    .map(rowToKnowledgeFact)
    .filter((f): f is NonNullable<typeof f> => !!f && f.state === "published");
  const routing = resolveAiRouting({ inbound: MSG });
  const retrieved = retrieveFactsForTurn({
    facts: published,
    message: MSG,
    subIntents: routing.subIntents,
  });
  console.log("\n=== RETRIEVAL FOR PRICING+LISTING MSG ===", {
    subIntents: routing.subIntents,
    retrieved: retrieved.map((r) => ({
      key: r.fact.factKey,
      type: r.fact.factType,
      rank: r.relevanceRank,
    })),
  });

  console.log("\n=== STATE COUNTS ===");
  const counts: Record<string, number> = {};
  for (const r of rows) counts[`${r.state}:${r.factType}`] = (counts[`${r.state}:${r.factType}`] || 0) + 1;
  console.log(counts);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
