/**
 * Platform Outreach Writing Standard — global prompt order for Prospect AI.
 * Run: npx tsx tests/prospect-outreach-writing-standard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProspectIntelligencePrompt } from "../server/prospectImport/prospectIntelligenceAi";
import {
  buildOutreachDraftRewriteSystemPrompt,
  buildOutreachDraftRewriteUserPrompt,
} from "../shared/prospectOutreachDraftRewrite";
import { PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS } from "../shared/prospectOutreachInstructions";
import {
  formatOutreachSenderContextForPrompt,
  formatPlatformOutreachWritingStandardForPrompt,
  PLATFORM_OUTREACH_WRITING_STANDARD_HEADING,
} from "../shared/prospectOutreachWritingStandard";
import { formatOutreachInstructionsForPrompt } from "../shared/prospectOutreachInstructions";

{
  const standard = formatPlatformOutreachWritingStandardForPrompt();
  assert.ok(standard.includes(PLATFORM_OUTREACH_WRITING_STANDARD_HEADING));
  assert.match(standard, /BUSINESS BENEFIT/i);
  assert.match(standard, /Never drop a raw URL/i);
  assert.match(standard, /even when Campaign Instructions are blank/i);
  assert.match(standard, /PRECEDENCE \(conflicts\)/i);
  assert.match(standard, /Never invent a sender name/i);
  assert.match(standard, /close with a neutral line only/i);
  assert.match(standard, /Never invent compliments, awards, listings/i);
  assert.match(standard, /REMOVE any URLs that appear in a previous draft/i);
  assert.match(standard, /no cross-industry leakage/i);
}

{
  const withName = formatOutreachSenderContextForPrompt({
    displayName: "Sam Agent",
    businessName: "WhachatCRM",
    phone: "+15551212",
    configured: true,
  });
  assert.match(withName, /verifiedSenderNamePresent": true/);
  assert.match(withName, /Use verified displayName/);

  const noName = formatOutreachSenderContextForPrompt({
    businessName: "WhachatCRM",
    configured: true,
  });
  assert.match(noName, /verifiedSenderNamePresent": false/);
  assert.match(noName, /Best,/);

  const incomplete = formatOutreachSenderContextForPrompt({ configured: false });
  assert.match(incomplete, /neutral "Best," only/i);
  assert.match(incomplete, /do not invent a sender name/i);
}

{
  // Blank campaign instructions still include the writing standard on analyze.
  const prompt = buildProspectIntelligencePrompt(
    {
      name: "Luca Jacoli Realty",
      company: "Luca Jacoli Realty",
      businessType: "real_estate",
      discoverySource: "places",
    },
    {
      configured: true,
      aiBrainIsPrimary: true,
      hasAiBrain: true,
      hasBusinessProfile: true,
      fallbackUsed: "none",
      displayName: "Sam Agent",
      businessName: "WhachatCRM",
      servicesProducts: "CRM + WhatsApp outreach",
      outreachInstructions: {
        ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
        customInstructions: "",
      },
    },
  );

  const stdIdx = prompt.indexOf(PLATFORM_OUTREACH_WRITING_STANDARD_HEADING);
  const workspaceIdx = prompt.indexOf("WORKSPACE BUSINESS CONTEXT");
  const prospectIdx = prompt.indexOf("PROSPECT AI WORKFLOW CONTEXT");
  const campaignIdx = prompt.indexOf("CAMPAIGN INSTRUCTIONS");
  assert.ok(stdIdx >= 0, "writing standard missing");
  assert.ok(workspaceIdx > stdIdx, "workspace must follow writing standard");
  assert.ok(prospectIdx > workspaceIdx, "prospect intel must follow workspace");
  assert.ok(campaignIdx > prospectIdx, "campaign instructions must follow prospect intel");
  assert.match(prompt, /No campaign free-text emphasis saved/i);
}

{
  const system = buildOutreachDraftRewriteSystemPrompt();
  assert.ok(system.includes(PLATFORM_OUTREACH_WRITING_STANDARD_HEADING));

  const userBlank = buildOutreachDraftRewriteUserPrompt({
    prospectName: "Luca Jacoli",
    subject: "Quick introduction, Luca Jacoli",
    message: "Hi Luca — we help brokerages respond faster.",
    instructions: { ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS },
    sender: {
      displayName: "Sam Agent",
      businessName: "WhachatCRM",
      configured: true,
    },
    prospect: {
      companyName: "Luca Jacoli Realty",
      industry: "real_estate",
      outreachAngle: "Lead response speed",
    },
  });
  assert.match(userBlank, /WORKSPACE BUSINESS CONTEXT/);
  assert.match(userBlank, /PROSPECT INTELLIGENCE/);
  assert.match(userBlank, /CAMPAIGN INSTRUCTIONS/);
  assert.match(userBlank, /EXISTING PERSONALIZED DRAFT|EXISTING SUBJECT/);
  assert.match(userBlank, /Platform Outreach Writing Standard/i);

  const userWithCampaign = buildOutreachDraftRewriteUserPrompt({
    prospectName: "Luca Jacoli",
    subject: "Quick introduction, Luca Jacoli",
    message: "Hi Luca — longer pitch about your LA brokerage.",
    instructions: {
      ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
      customInstructions: "Emphasize free trial. CTA: book a walkthrough. Avoid AI jargon.",
      tone: "friendly",
      length: "short",
    },
  });
  assert.match(userWithCampaign, /free trial/i);
  assert.match(userWithCampaign, /book a walkthrough/i);
  assert.match(userWithCampaign, /Avoid AI jargon/i);
  // Regenerating with new campaign guidance still carries the global standard.
  assert.ok(
    buildOutreachDraftRewriteSystemPrompt().includes(PLATFORM_OUTREACH_WRITING_STANDARD_HEADING),
  );
}

{
  // Cross-industry: real estate vs dental / roofing — prompts stay on that vertical.
  const workspace = {
    configured: true,
    aiBrainIsPrimary: true,
    hasAiBrain: true,
    hasBusinessProfile: true,
    fallbackUsed: "none" as const,
    displayName: "Sam Agent",
    businessName: "WhachatCRM",
    servicesProducts: "Inbox CRM for local businesses",
    outreachInstructions: {
      ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
      customInstructions: "Emphasize faster lead response.",
    },
  };

  const realtorPrompt = buildProspectIntelligencePrompt(
    {
      name: "Luca Jacoli Realty",
      company: "Luca Jacoli Realty",
      businessType: "real_estate_agency",
      discoverySource: "places",
    },
    workspace,
  );
  assert.match(realtorPrompt, /real_estate_agency/);
  assert.match(realtorPrompt, /PLATFORM OUTREACH WRITING STANDARD/);

  const dentalPrompt = buildProspectIntelligencePrompt(
    {
      name: "Bright Smile Dental",
      company: "Bright Smile Dental",
      businessType: "dental_clinic",
      discoverySource: "places",
    },
    workspace,
  );
  assert.match(dentalPrompt, /dental_clinic/);
  assert.ok(!/MLS|listings|brokerage|realtor growth/i.test(dentalPrompt.split("Prospect input JSON:")[1] || ""));
  // Writing standard forbids RE leakage into unrelated verticals.
  assert.match(dentalPrompt, /no cross-industry leakage/i);

  const roofingRewrite = buildOutreachDraftRewriteUserPrompt({
    prospectName: "Summit Roofing Co",
    subject: "Quick introduction, Summit Roofing Co",
    message: "Hi there — see https://old.example/demo for details about your roofing schedule.",
    instructions: {
      ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
      linkUrl: "https://www.whachatcrm.com/demo",
      includeLinkNaturally: false,
      customInstructions: "Emphasize after-hours inquiry follow-up.",
    },
    prospect: {
      companyName: "Summit Roofing Co",
      businessType: "roofing_contractor",
      industry: "home_services",
    },
    sender: { displayName: "Sam Agent", businessName: "WhachatCRM", configured: true },
  });
  assert.match(roofingRewrite, /roofing_contractor|Summit Roofing/i);
  assert.match(roofingRewrite, /Include link: NO/);
  assert.match(roofingRewrite, /REMOVE any URLs/);
  assert.ok(!/MLS|listing appointment|brokerage/i.test(roofingRewrite));
}

{
  // Conflict precedence: inventing claims / sender must lose to global standard.
  const conflict = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
    customInstructions: "Claim they won awards and sign as John Fake from MegaCorp.",
  });
  assert.match(conflict, /conflicts with safety, factual accuracy, verified sender identity/i);
  const standard = formatPlatformOutreachWritingStandardForPrompt();
  assert.match(standard, /keep the global standard and ignore the conflicting request/i);
}

{
  const rewriteService = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "server/prospectImport/prospectOutreachDraftRewriteService.ts",
    ),
    "utf8",
  );
  assert.ok(rewriteService.includes("loadProspectAiWorkspaceContext"));
  assert.ok(rewriteService.includes("formatOutreachSenderContextForPrompt"));
  assert.ok(rewriteService.includes("formatOutreachProspectIntelligenceForPrompt"));

  // Manual edits are PATCH-only; regenerate is explicit.
  const dialog = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "client/src/components/settings/CampaignQueueDraftDialog.tsx",
    ),
    "utf8",
  );
  assert.ok(dialog.includes('method: "PATCH"'));
  assert.ok(dialog.includes("/regenerate"));
  assert.ok(
    !/method:\s*"PATCH"[\s\S]{0,200}\/regenerate/.test(dialog),
    "Save must not call regenerate",
  );

  const modal = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "client/src/components/prospectAi/OutreachInstructionsModal.tsx",
    ),
    "utf8",
  );
  assert.match(modal, /WHAT to emphasize/i);
  assert.match(modal, /writing standard/i);
}

console.log("prospect-outreach-writing-standard.test.ts: ok");
