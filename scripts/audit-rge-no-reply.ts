/**
 * RGE no-reply workflow audit for a contact.
 * Usage: npx tsx scripts/audit-rge-no-reply.ts --name "Susu Sahbak"
 */
import "dotenv/config";
import { ilike, eq, desc, and, gte, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  conversations,
  messages,
  noReplyJobs,
  workflows,
  workflowExecutions,
} from "../shared/schema";

const argv = process.argv.slice(2);
const nameArg = argv.find((a) => a.startsWith("--name="))?.slice(7) ??
  (argv.includes("--name") ? argv[argv.indexOf("--name") + 1] : "Susu Sahbak");

async function main() {
  const rows = await db.select().from(contacts).where(ilike(contacts.name, nameArg));
  if (!rows.length) {
    const fuzzy = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(ilike(contacts.name, `%${nameArg.split(" ")[0]}%`))
      .limit(15);
    console.log("NO_EXACT_MATCH", JSON.stringify(fuzzy, null, 2));
    return;
  }

  for (const c of rows) {
    console.log("\n=== CONTACT ===");
    console.log(
      JSON.stringify(
        {
          id: c.id,
          name: c.name,
          userId: c.userId,
          tag: c.tag,
          pipelineStage: c.pipelineStage,
          source: c.source,
          primaryChannel: c.primaryChannel,
          lastIncomingChannel: c.lastIncomingChannel,
          lastIncomingAt: c.lastIncomingAt,
        },
        null,
        2,
      ),
    );

    const convs = await db.select().from(conversations).where(eq(conversations.contactId, c.id));
    console.log("\n=== CONVERSATIONS ===");
    console.log(
      JSON.stringify(
        convs.map((x) => ({
          id: x.id,
          channel: x.channel,
          status: x.status,
          lastMessageAt: x.lastMessageAt,
          lastMessageDirection: x.lastMessageDirection,
        })),
        null,
        2,
      ),
    );

    for (const conv of convs) {
      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(20);
      console.log(`\n=== MESSAGES (${conv.channel}) ===`);
      for (const m of [...msgs].reverse()) {
        console.log(
          JSON.stringify({
            at: m.createdAt,
            dir: m.direction,
            status: m.status,
            preview: (m.content || "").slice(0, 140),
            error: m.errorMessage,
          }),
        );
      }
    }

    const nr = await db
      .select()
      .from(noReplyJobs)
      .where(eq(noReplyJobs.contactId, c.id))
      .orderBy(desc(noReplyJobs.createdAt));
    console.log(`\n=== NO_REPLY_JOBS (${nr.length}) ===`);
    const wfIds = [...new Set(nr.map((j) => j.workflowId))];
    const wfRows =
      wfIds.length > 0
        ? await db.select().from(workflows).where(inArray(workflows.id, wfIds))
        : [];
    const wfById = new Map(wfRows.map((w) => [w.id, w]));
    for (const j of nr) {
      const wf = wfById.get(j.workflowId);
      console.log(
        JSON.stringify({
          id: j.id,
          workflow: wf?.name,
          templateKey: (wf?.triggerConditions as { templateKey?: string })?.templateKey,
          status: j.status,
          runAt: j.runAt,
          anchorOutboundAt: j.anchorOutboundAt,
          snapshotLastInboundAt: j.snapshotLastInboundAt,
          scheduledReason: j.scheduledReason,
          lastError: j.lastError,
          createdAt: j.createdAt,
        }),
      );
    }

    const userWfs = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.userId, c.userId), eq(workflows.triggerType, "no_reply")));
    console.log("\n=== USER NO_REPLY WORKFLOWS ===");
    for (const wf of userWfs) {
      console.log(
        JSON.stringify({
          id: wf.id,
          name: wf.name,
          isActive: wf.isActive,
          triggerConditions: wf.triggerConditions,
        }),
      );
    }

    const convIds = convs.map((cv) => cv.id);
    const since = new Date("2026-06-17T00:00:00Z");
    if (convIds.length > 0) {
      const execs = await db
        .select()
        .from(workflowExecutions)
        .where(
          and(
            inArray(workflowExecutions.conversationId, convIds),
            gte(workflowExecutions.executedAt, since),
          ),
        )
        .orderBy(desc(workflowExecutions.executedAt));
      console.log(`\n=== WORKFLOW_EXECUTIONS since 2026-06-17 (${execs.length}) ===`);
      for (const e of execs) {
        const wf = userWfs.find((w) => w.id === e.workflowId) ??
          (await db.select().from(workflows).where(eq(workflows.id, e.workflowId)))[0];
        console.log(
          JSON.stringify({
            at: e.executedAt,
            workflow: wf?.name,
            templateKey: (wf?.triggerConditions as { templateKey?: string })?.templateKey,
            conv: e.conversationId,
            status: e.status,
            trigger: e.triggerData,
            actions: e.actionsExecuted,
            error: e.errorMessage,
          }),
        );
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
