/**
 * Repair installed RGE W4 workflows still using legacy stage_in conditions.
 * Usage: npx tsx scripts/repair-rge-w4-conditions.ts
 */
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "../drizzle/db";
import { templateAssets, workflows } from "../shared/schema";
import { rgeW4NoReplyConditions } from "../shared/rgeNoReplyWorkflows";

const TEMPLATE_ID = "realtor-growth-engine";
const nextConditions = rgeW4NoReplyConditions();

async function main() {
  const wfRows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.triggerType, "no_reply"));

  let patchedWorkflows = 0;
  for (const row of wfRows) {
    const tc = row.triggerConditions as { templateKey?: string; templateId?: string; rgeConditions?: { type?: string }[] };
    if (tc?.templateKey !== "W4" || tc?.templateId !== TEMPLATE_ID) continue;
    const hasLegacyStageIn = Array.isArray(tc.rgeConditions) &&
      tc.rgeConditions.some((c) => c?.type === "stage_in");
    if (!hasLegacyStageIn) continue;
    await db
      .update(workflows)
      .set({
        triggerConditions: {
          ...tc,
          rgeConditions: nextConditions,
        },
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, row.id));
    patchedWorkflows++;
  }

  const asset = await db.query.templateAssets.findFirst({
    where: and(eq(templateAssets.templateId, TEMPLATE_ID), eq(templateAssets.assetType, "workflows")),
  });

  let patchedAsset = false;
  if (asset) {
    const def = asset.definition as { workflows?: { key?: string; conditions?: unknown[] }[] };
    const list = def?.workflows;
    if (Array.isArray(list)) {
      const w4 = list.find((w) => w?.key === "W4");
      const hasLegacyStageIn = Array.isArray(w4?.conditions) &&
        w4!.conditions.some((c) => (c as { type?: string })?.type === "stage_in");
      if (w4 && hasLegacyStageIn) {
        w4.conditions = nextConditions;
        await db
          .update(templateAssets)
          .set({ definition: { ...def, workflows: list } })
          .where(eq(templateAssets.id, asset.id));
        patchedAsset = true;
      }
    }
  }

  console.log(
    JSON.stringify({
      patchedInstalledWorkflows: patchedWorkflows,
      patchedTemplateAsset: patchedAsset,
      w4Conditions: nextConditions,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
