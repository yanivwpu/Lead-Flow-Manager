/**
 * Repair installed RGE W4/W5/W6 no-reply workflows for Meta-safe last-inbound timing.
 *
 * Usage:
 *   npx tsx scripts/repair-rge-no-reply-meta-safe.ts           # apply
 *   npx tsx scripts/repair-rge-no-reply-meta-safe.ts --dry-run  # report only
 *
 * Conservative rules:
 * - Only workflows with templateId=realtor-growth-engine and templateKey W4|W5|W6
 * - W4 delayHours updated 24 → 20 only when still at legacy default (24) or missing
 * - Custom W4 delays are preserved; anchor last_inbound is still applied
 * - W5/W6 delays only updated when still at canonical 72 / 168
 * - Never creates duplicate workflows; never reinstalls RGE
 */
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "../drizzle/db";
import { templateAssets, workflows } from "../shared/schema";
import {
  RGE_NO_REPLY_ANCHOR,
  RGE_TEMPLATE_ID,
  RGE_W4_DELAY_HOURS,
  RGE_W4_LEGACY_DELAY_HOURS,
  RGE_W4_LEGACY_WORKFLOW_NAMES,
  RGE_W4_WORKFLOW_NAME,
  RGE_W5_DELAY_HOURS,
  RGE_W6_DELAY_HOURS,
  rgeW4NoReplyConditions,
} from "../shared/rgeNoReplyWorkflows";

const dryRun = process.argv.includes("--dry-run");

type Tc = {
  type?: string;
  delayHours?: number;
  anchor?: string;
  templateKey?: string;
  templateId?: string;
  rgeConditions?: unknown[];
  [key: string]: unknown;
};

function nextDelayHours(key: "W4" | "W5" | "W6", current: number | undefined): number | undefined {
  if (key === "W4") {
    if (current == null || !Number.isFinite(current) || current === RGE_W4_LEGACY_DELAY_HOURS) {
      return RGE_W4_DELAY_HOURS;
    }
    return undefined; // preserve customization
  }
  if (key === "W5") {
    if (current == null || current === RGE_W5_DELAY_HOURS) return RGE_W5_DELAY_HOURS;
    return undefined;
  }
  if (current == null || current === RGE_W6_DELAY_HOURS) return RGE_W6_DELAY_HOURS;
  return undefined;
}

async function main() {
  const wfRows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.triggerType, "no_reply"));

  const report: Array<Record<string, unknown>> = [];
  let patchedWorkflows = 0;

  for (const row of wfRows) {
    const tc = (row.triggerConditions || {}) as Tc;
    if (tc.templateId !== RGE_TEMPLATE_ID) continue;
    const key = tc.templateKey;
    if (key !== "W4" && key !== "W5" && key !== "W6") continue;

    const nextTc: Tc = { ...tc, type: "no_reply", anchor: RGE_NO_REPLY_ANCHOR };
    const delayPatch = nextDelayHours(key, Number(tc.delayHours));
    if (delayPatch != null) {
      nextTc.delayHours = delayPatch;
    } else if (Number.isFinite(Number(tc.delayHours))) {
      nextTc.delayHours = Number(tc.delayHours);
    }

    let namePatch: string | undefined;
    if (key === "W4") {
      nextTc.rgeConditions = rgeW4NoReplyConditions();
      if (
        (RGE_W4_LEGACY_WORKFLOW_NAMES as readonly string[]).includes(row.name) ||
        row.name === "No Response Follow-Up (24h)"
      ) {
        namePatch = RGE_W4_WORKFLOW_NAME;
      }
    }

    const delayChanged = nextTc.delayHours !== tc.delayHours;
    const anchorChanged = tc.anchor !== RGE_NO_REPLY_ANCHOR;
    const nameChanged = namePatch != null && namePatch !== row.name;
    if (!delayChanged && !anchorChanged && !nameChanged) {
      report.push({ id: row.id, key, action: "unchanged" });
      continue;
    }

    report.push({
      id: row.id,
      userId: row.userId,
      key,
      action: dryRun ? "would_patch" : "patched",
      from: { delayHours: tc.delayHours, anchor: tc.anchor, name: row.name },
      to: {
        delayHours: nextTc.delayHours,
        anchor: nextTc.anchor,
        name: namePatch ?? row.name,
      },
    });

    if (!dryRun) {
      await db
        .update(workflows)
        .set({
          triggerConditions: nextTc,
          ...(namePatch ? { name: namePatch } : {}),
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, row.id));
      patchedWorkflows++;
    } else {
      patchedWorkflows++;
    }
  }

  const asset = await db.query.templateAssets.findFirst({
    where: and(eq(templateAssets.templateId, RGE_TEMPLATE_ID), eq(templateAssets.assetType, "workflows")),
  });

  let patchedAsset = false;
  if (asset) {
    const def = asset.definition as {
      workflows?: {
        key?: string;
        name?: string;
        trigger?: { type?: string; delayHours?: number; anchor?: string };
        conditions?: unknown[];
      }[];
    };
    const list = def?.workflows;
    if (Array.isArray(list)) {
      let changed = false;
      for (const key of ["W4", "W5", "W6"] as const) {
        const wf = list.find((w) => w?.key === key);
        if (!wf) continue;
        const want =
          key === "W4" ? RGE_W4_DELAY_HOURS : key === "W5" ? RGE_W5_DELAY_HOURS : RGE_W6_DELAY_HOURS;
        wf.trigger = {
          ...(wf.trigger || { type: "no_reply" }),
          type: "no_reply",
          delayHours: want,
          anchor: RGE_NO_REPLY_ANCHOR,
        };
        if (key === "W4") {
          wf.name = RGE_W4_WORKFLOW_NAME;
          wf.conditions = rgeW4NoReplyConditions();
        }
        changed = true;
      }
      if (changed) {
        patchedAsset = true;
        if (!dryRun) {
          await db
            .update(templateAssets)
            .set({ definition: { ...def, workflows: list } })
            .where(eq(templateAssets.id, asset.id));
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        patchedInstalledWorkflows: patchedWorkflows,
        patchedTemplateAsset: patchedAsset,
        report,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
