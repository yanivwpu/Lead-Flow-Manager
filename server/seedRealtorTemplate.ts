import { db } from "../drizzle/db";
import { templates, templateAssets } from "../shared/schema";
import { eq, and } from "drizzle-orm";

export async function seedRealtorTemplate() {
  console.log("[Seed] Starting Realtor Growth Engine template seeding...");

  const templateId = "realtor-growth-engine";

  const existingTemplate = await db.query.templates.findFirst({
    where: eq(templates.id, templateId),
  });

  if (!existingTemplate) {
    await db.insert(templates).values({
      id: templateId,
      name: "Realtor Growth Engine",
      description: "Complete end-to-end CRM automation for real estate agents. Includes AI lead scoring, automated follow-ups, appointment booking, pipeline management, and WhatsApp-optimized message templates.",
      isPremium: true,
      version: "1.0.0",
    });
    console.log(`[Seed] Created template: ${templateId}`);
  } else {
    console.log(`[Seed] Template ${templateId} already exists.`);
  }

  const assets = [
    {
      templateId,
      assetType: "pipeline" as const,
      version: "1.0.0",
      definition: {
        name: "Realtor Pipeline (Growth Engine)",
        stages: [
          { stageKey: "new_lead", displayName: "New Lead", order: 1, defaultSLADays: 1 },
          { stageKey: "responded", displayName: "Responded", order: 2, defaultSLADays: 2 },
          { stageKey: "qualified_hot", displayName: "Qualified (Hot)", order: 3, defaultSLADays: 1 },
          { stageKey: "qualified_warm", displayName: "Qualified (Warm)", order: 4, defaultSLADays: 3 },
          { stageKey: "nurture", displayName: "Nurture / Follow-Up", order: 5, defaultSLADays: 7 },
          { stageKey: "appointment_set", displayName: "Appointment Set", order: 6, defaultSLADays: 1 },
          { stageKey: "under_contract", displayName: "Under Contract", order: 7, defaultSLADays: 30 },
          { stageKey: "closed", displayName: "Closed", order: 8 },
          { stageKey: "unqualified", displayName: "Unqualified", order: 9 },
        ],
      },
    },
    {
      templateId,
      assetType: "tags" as const,
      version: "1.0.0",
      definition: {
        tags: [
          "New", "Warm", "Hot", "Appointment Requested", "Appointment Booked",
          "Buyer", "Seller", "Investor", "Rental", "Unqualified",
          "Do Not Contact", "Follow-Up Needed", "High Intent",
        ],
      },
    },
    {
      templateId,
      assetType: "fields" as const,
      version: "1.0.0",
      definition: {
        fields: [
          { key: "fullName", label: "Full Name", type: "text" },
          { key: "phone", label: "Phone", type: "text" },
          { key: "email", label: "Email", type: "text" },
          { key: "budget", label: "Budget", type: "text" },
          { key: "timeline", label: "Timeline", type: "select", options: ["ASAP", "1-3 months", "3-6 months", "6+ months"] },
          { key: "location", label: "Location", type: "text" },
          { key: "leadType", label: "Lead Type", type: "select", options: ["Buyer", "Seller", "Rental", "Investor"] },
          { key: "preApproved", label: "Pre-Approved", type: "select", options: ["Yes", "No", "Unknown"] },
          { key: "appointmentPreference", label: "Appointment Preference", type: "text" },
          { key: "notes", label: "Notes", type: "text" },
          { key: "leadScore", label: "Lead Score", type: "number", min: 0, max: 100 },
          { key: "languageDetected", label: "Language Detected", type: "select", options: ["en", "es", "he"] },
        ],
      },
    },
    {
      templateId,
      assetType: "message_templates" as const,
      version: "1.0.0",
      definition: {
        templates: [
          {
            key: "intro_fast_reply",
            title: "Intro / Fast Reply",
            body: "Hi {{firstName}}! Thanks for reaching out. I'm a local real estate specialist in {{city}}. Are you looking to buy, sell, or rent? I'd love to help you find exactly what you need.",
            variables: ["firstName", "city"],
          },
          {
            key: "buyer_qualification",
            title: "Buyer Qualification",
            body: "Great to hear you're looking to buy, {{firstName}}! A few quick questions to help me find the perfect property:\n1. What's your budget range?\n2. Which neighborhoods interest you?\n3. How soon are you looking to move?\n4. Have you been pre-approved for a mortgage?",
            variables: ["firstName"],
          },
          {
            key: "seller_qualification",
            title: "Seller Qualification",
            body: "Hi {{firstName}}, thanks for considering selling! To give you the best advice:\n1. What's the address of your property?\n2. How soon are you looking to sell?\n3. Have you had a recent appraisal?\nI can prepare a free market analysis for you.",
            variables: ["firstName"],
          },
          {
            key: "schedule_showing",
            title: "Schedule Showing / Call",
            body: "Hi {{firstName}}! I'd love to set up a showing or a quick call to discuss your needs. What times work best for you? I'm available {{preferredTime}}.",
            variables: ["firstName", "preferredTime"],
          },
          {
            key: "followup_24h",
            title: "Follow-up 24h",
            body: "Hi {{firstName}}, just checking in! I wanted to make sure you got my previous message. Is there anything I can help you with regarding properties in {{city}}?",
            variables: ["firstName", "city"],
          },
          {
            key: "followup_3d",
            title: "Follow-up 3d",
            body: "Hey {{firstName}}, I've been keeping an eye on new listings in {{city}} and thought of you. Would you like me to send you some options that match your criteria?",
            variables: ["firstName", "city"],
          },
          {
            key: "followup_7d",
            title: "Follow-up 7d",
            body: "Hi {{firstName}}, it's been a week since we last chatted. The market is moving fast in {{city}}. If you're still interested, I'd love to reconnect and show you what's available. No pressure at all!",
            variables: ["firstName", "city"],
          },
          {
            key: "unqualified_close",
            title: "Unqualified / Polite Close",
            body: "Hi {{firstName}}, thank you for your interest. Based on our conversation, it seems like now might not be the right time. Please don't hesitate to reach out whenever you're ready — I'm always here to help!",
            variables: ["firstName"],
          },
          {
            key: "re_engagement",
            title: "Re-engagement",
            body: "Hi {{firstName}}! It's been a while since we connected. I wanted to reach out because there are some exciting new properties in {{city}} I thought you might like. Interested in taking a look?",
            variables: ["firstName", "city"],
          },
        ],
      },
    },
    {
      templateId,
      assetType: "workflows" as const,
      version: "1.0.0",
      definition: {
        workflows: [
          {
            key: "W1",
            name: "New Lead Auto-Reply + Create Lead",
            enabledByDefault: true,
            trigger: { type: "new_chat" },
            conditions: [],
            actions: [
              { type: "create_or_update_lead" },
              { type: "apply_tag", tag: "New" },
              { type: "set_pipeline_stage", stage: "New Lead" },
              { type: "send_message_template", templateKey: "intro_fast_reply" },
              { type: "create_task", title: "Review new lead", dueDays: 1 },
            ],
          },
          {
            key: "W2",
            name: "AI Qualify + Score on Every Inbound",
            enabledByDefault: true,
            trigger: { type: "keyword" },
            conditions: [],
            actions: [
              { type: "run_lead_scoring" },
              { type: "update_lead_fields", fields: ["leadScore", "leadType", "budget", "timeline", "location"] },
              { type: "conditional", rules: [
                { condition: "leadScore >= 75", actions: [
                  { type: "apply_tag", tag: "Hot" },
                  { type: "set_pipeline_stage", stage: "Qualified (Hot)" },
                ]},
                { condition: "leadScore >= 45", actions: [
                  { type: "apply_tag", tag: "Warm" },
                  { type: "set_pipeline_stage", stage: "Qualified (Warm)" },
                ]},
              ]},
            ],
          },
          {
            key: "W3",
            name: "Appointment Intent -> Booking Prompt",
            enabledByDefault: true,
            trigger: { type: "keyword", keywords: ["call", "book", "available", "tour", "showing", "visit", "schedule"] },
            conditions: [{ type: "message_contains_intent", intents: ["call", "book", "available", "tour", "showing"] }],
            actions: [
              { type: "apply_tag", tag: "Appointment Requested" },
              { type: "send_message_template", templateKey: "schedule_showing" },
              { type: "create_task", title: "Book appointment", dueDays: 1 },
            ],
          },
          {
            key: "W4",
            name: "No Response Follow-Up (24h)",
            enabledByDefault: true,
            trigger: { type: "no_reply", delayHours: 24 },
            conditions: [{ type: "stage_in", stages: ["New Lead", "Responded", "Qualified (Hot)", "Qualified (Warm)"] }],
            actions: [
              { type: "send_message_template", templateKey: "followup_24h" },
              { type: "apply_tag", tag: "Follow-Up Needed" },
            ],
          },
          {
            key: "W5",
            name: "No Response Follow-Up (3d)",
            enabledByDefault: true,
            trigger: { type: "no_reply", delayHours: 72 },
            conditions: [{ type: "stage_not_in", stages: ["Closed", "Unqualified"] }],
            actions: [
              { type: "send_message_template", templateKey: "followup_3d" },
            ],
          },
          {
            key: "W6",
            name: "No Response Follow-Up (7d) + Nurture",
            enabledByDefault: true,
            trigger: { type: "no_reply", delayHours: 168 },
            conditions: [{ type: "stage_not_in", stages: ["Closed", "Unqualified"] }],
            actions: [
              { type: "send_message_template", templateKey: "followup_7d" },
              { type: "set_pipeline_stage", stage: "Nurture / Follow-Up" },
            ],
          },
          {
            key: "W7",
            name: "Unqualified / DNC Safety",
            enabledByDefault: true,
            trigger: { type: "keyword", keywords: ["stop", "unsubscribe", "spam", "not interested", "remove"] },
            conditions: [{ type: "message_contains_any", keywords: ["stop", "unsubscribe", "remove me", "not interested"] }],
            actions: [
              { type: "apply_tag", tag: "Do Not Contact" },
              { type: "set_pipeline_stage", stage: "Unqualified" },
              { type: "send_message_template", templateKey: "unqualified_close" },
            ],
          },
          {
            key: "W8",
            name: "Language Detection",
            enabledByDefault: false,
            trigger: { type: "keyword" },
            conditions: [],
            actions: [
              { type: "detect_language" },
              { type: "update_lead_fields", fields: ["languageDetected"] },
            ],
          },
        ],
      },
    },
    {
      templateId,
      assetType: "ai_rules" as const,
      version: "1.0.0",
      definition: {
        scoringRules: [
          { signal: "asks price / availability / viewing", scoreChange: 25, keywords: ["price", "cost", "how much", "available", "viewing", "tour", "show me"] },
          { signal: "shares budget", scoreChange: 20, keywords: ["budget", "afford", "range", "max", "spend"] },
          { signal: "asks to call / book", scoreChange: 30, keywords: ["call", "book", "appointment", "schedule", "meet"] },
          { signal: "just looking", scoreChange: -20, keywords: ["just looking", "browsing", "not ready", "maybe later"] },
          { signal: "spam / irrelevant", scoreChange: -100, keywords: ["spam", "scam", "lottery", "won"] },
        ],
        classification: {
          hot: { minScore: 75 },
          warm: { minScore: 45 },
          new: { minScore: 0 },
          unqualified: { maxScore: 0 },
        },
        leadTypeDetection: [
          { type: "Buyer", keywords: ["buy", "purchase", "looking for", "apartment", "house", "condo", "property"] },
          { type: "Seller", keywords: ["sell", "listing", "list my", "market value", "appraisal"] },
          { type: "Rental", keywords: ["rent", "lease", "rental", "tenant", "monthly"] },
          { type: "Investor", keywords: ["invest", "roi", "return", "flip", "portfolio", "yield"] },
        ],
      },
    },
  ];

  for (const asset of assets) {
    const existingAsset = await db.query.templateAssets.findFirst({
      where: and(
        eq(templateAssets.templateId, templateId),
        eq(templateAssets.assetType, asset.assetType)
      ),
    });

    if (!existingAsset) {
      await db.insert(templateAssets).values(asset);
      console.log(`[Seed] Created asset: ${asset.assetType} for ${templateId}`);
    } else {
      console.log(`[Seed] Asset ${asset.assetType} already exists for ${templateId}.`);
    }
  }

  console.log("[Seed] Realtor Growth Engine seeding complete.");
}
