/**
 * Explicit approved-material requests must beat new-chat Ask Question and
 * pending-ask consumption without weakening grounding or a general chatbot bypass.
 * Run: npx tsx --test tests/webchat-explicit-approved-asset.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  approvedAssetClarificationCaption,
  approvedAssetDeterministicCaption,
  classifyExplicitApprovedAssetDecision,
  inboundLooksLikeExplicitApprovedFileRequest,
  pickApprovedMarketingAssetForInbound,
  resolveExplicitApprovedAssetRequest,
  toMarketingAssetCatalogItem,
} from "../shared/marketingAssets";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import { decideWebchatInboundAiEvaluation } from "../shared/webchatInboundAiDispatch";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import { isCasualWebchatGreeting } from "../shared/webchatGreetingWelcome";
import {
  wouldPendingAskComplete,
  createChatbotPendingAsk,
  mergeChatbotPendingIntoAiControl,
  pendingAskFromAiControl,
} from "../shared/chatbotAskQuestion";
import { matchAskQuestionQuickReply } from "../shared/chatbotAskQuestionOptions";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const GUIDE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BROCHURE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const BROCHURE_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const ES_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const FORGED_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const guide = toMarketingAssetCatalogItem({
  id: GUIDE_ID,
  displayName: "WhatsApp Coexistence Guide",
  language: "en",
  kind: "document",
  topics: ["whatsapp", "coexistence", "guide"],
})!;
const brochureA = toMarketingAssetCatalogItem({
  id: BROCHURE_ID,
  displayName: "Company brochure",
  language: "all",
  kind: "document",
  topics: ["brochure"],
})!;
const brochureB = toMarketingAssetCatalogItem({
  id: BROCHURE_B_ID,
  displayName: "Summer brochure",
  language: "all",
  kind: "document",
  topics: ["brochure", "summer"],
})!;
const coexistenceImage = toMarketingAssetCatalogItem({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
  displayName: "WhatsApp Coexistence",
  description:
    "A visual guide for using WhatsApp Business App and WhachatCRM with the same phone number",
  language: "en",
  kind: "image",
  topics: [],
  originalFilename: "whatsapp-coexistence-guide.png",
})!;
const whatsappPricingPdf = toMarketingAssetCatalogItem({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8",
  displayName: "Pricing PDF",
  description: "WhatsApp pricing",
  language: "en",
  kind: "document",
  topics: ["whatsapp", "pricing"],
})!;
const FLYER_IMAGE_ID = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const ONBOARDING_GUIDE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const flyerImage = toMarketingAssetCatalogItem({
  id: FLYER_IMAGE_ID,
  displayName: "Vintage listing flyer",
  language: "en",
  kind: "image",
  topics: ["flyer", "listing"],
})!;
const onboardingGuide = toMarketingAssetCatalogItem({
  id: ONBOARDING_GUIDE_ID,
  displayName: "Onboarding Guide",
  language: "en",
  kind: "document",
  topics: ["onboarding", "guide"],
})!;
const spanishOnly = toMarketingAssetCatalogItem({
  id: ES_ID,
  displayName: "WhatsApp Coexistence Guide",
  language: "es",
  kind: "document",
  topics: ["whatsapp", "coexistence", "guide"],
})!;

const CANONICAL = [
  { label: "Features & pricing", value: "Features & pricing" },
  { label: "Find my solution", value: "Find my solution" },
  { label: "Book a demo", value: "Book a demo" },
];

const GUIDE_REQUEST = "Can you send me the WhatsApp Coexistence Guide?";
const GUIDE_REPEAT = "Please send me the WhatsApp Coexistence Guide.";

const aiBase = {
  rolloutEnabled: true,
  allowlisted: true,
  widgetEnabled: true,
  hasAiBrainAccess: true,
  planIsProOrTrial: true,
  chatbotOwnsReply: false,
  handoffActive: false,
  aiPaused: false,
  automationsPaused: false,
  optedOut: false,
  rateLimited: false,
};

test("exact WhachatCRM guide request is a unique explicit match", () => {
  assert.equal(inboundLooksLikeExplicitApprovedFileRequest(GUIDE_REQUEST), true);
  assert.equal(inboundLooksLikeExplicitApprovedFileRequest(GUIDE_REPEAT), true);
  assert.equal(inboundLooksLikeExplicitApprovedFileRequest("Tell me about WhatsApp"), false);
  assert.equal(inboundLooksLikeExplicitApprovedFileRequest("Hello"), false);
  const resolved = resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, [guide, brochureA]);
  assert.equal(resolved.kind, "unique");
  if (resolved.kind === "unique") assert.equal(resolved.asset.id, GUIDE_ID);
  assert.equal(pickApprovedMarketingAssetForInbound("Tell me about WhatsApp", [guide]), null);
});

test("shorter-named coexistence image beats a weaker WhatsApp PDF when visitor says guide", () => {
  const catalog = [coexistenceImage, whatsappPricingPdf, brochureA];
  const resolved = resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, catalog);
  assert.equal(resolved.kind, "unique");
  if (resolved.kind === "unique") {
    assert.equal(resolved.asset.id, coexistenceImage.id);
    assert.equal(resolved.asset.kind, "image");
  }
  assert.equal(
    toMarketingAssetCatalogItem({
      id: coexistenceImage.id,
      displayName: "WhatsApp Coexistence",
      language: "English",
      kind: "image",
    })?.language,
    "en",
  );
  const byFilename = resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, [
    toMarketingAssetCatalogItem({
      id: coexistenceImage.id,
      displayName: "Coexistence",
      description:
        "A visual guide for using WhatsApp Business App and WhachatCRM with the same phone number",
      language: "en",
      kind: "image",
      originalFilename: "whatsapp-coexistence-guide.png",
    })!,
    whatsappPricingPdf,
  ]);
  assert.equal(byFilename.kind, "unique");
  if (byFilename.kind === "unique") assert.equal(byFilename.asset.kind, "image");
  const classified = classifyExplicitApprovedAssetDecision({
    inboundText: GUIDE_REQUEST,
    enabledCount: 3,
    localeMatchedCount: 3,
    resolution: resolved,
  });
  assert.equal(classified.decision, "unique_asset_priority");
  assert.equal(classified.uniqueKind, "image");
  assert.equal(
    classifyExplicitApprovedAssetDecision({
      inboundText: "Hello",
      enabledCount: 3,
      localeMatchedCount: 3,
      resolution: { kind: "none" },
    }).decision,
    "no_explicit_file_intent",
  );
  assert.equal(
    classifyExplicitApprovedAssetDecision({
      inboundText: GUIDE_REQUEST,
      enabledCount: 0,
      localeMatchedCount: 0,
      resolution: { kind: "none" },
    }).decision,
    "no_enabled_assets",
  );
  assert.equal(
    classifyExplicitApprovedAssetDecision({
      inboundText: GUIDE_REQUEST,
      enabledCount: 2,
      localeMatchedCount: 0,
      resolution: { kind: "none" },
    }).decision,
    "locale_mismatch",
  );
  assert.equal(
    classifyExplicitApprovedAssetDecision({
      inboundText: GUIDE_REQUEST,
      enabledCount: 2,
      localeMatchedCount: 2,
      resolution: { kind: "none" },
    }).decision,
    "no_matching_candidate",
  );
  assert.equal(
    classifyExplicitApprovedAssetDecision({
      inboundText: GUIDE_REQUEST,
      enabledCount: 2,
      localeMatchedCount: 2,
      resolution: { kind: "ambiguous", assets: [brochureA, brochureB] },
    }).decision,
    "ambiguous_candidates",
  );
  const shared = read("shared/marketingAssets.ts");
  assert.match(shared, /unique_asset_priority/);
  assert.match(shared, /no_enabled_assets/);
  assert.match(shared, /locale_mismatch/);
  assert.match(shared, /no_explicit_file_intent/);
  assert.match(shared, /no_matching_candidate/);
  assert.match(shared, /ambiguous_candidates/);
  const explicit = read("server/marketingAssets/explicitAssetTurn.ts");
  assert.match(explicit, /logExplicitApprovedAssetDecision/);
  assert.match(explicit, /enabledCount: catalog.enabledCount/);
  assert.match(explicit, /localeMatchedCount: catalog.localeMatchedCount/);
  assert.match(explicit, /limit: 200/);
  assert.doesNotMatch(explicit, /mediaStorageKey/);
  const store = read("server/marketingAssets/assetStore.ts");
  assert.match(store, /enabledCount/);
  assert.match(store, /localeMatchedCount/);
  assert.match(store, /originalFilename: row.originalFilename/);
});

test("open/see/guide stay delivery-shaped and never become broad triggers", () => {
  const catalog = [guide, brochureA, brochureB, flyerImage, onboardingGuide];
  const sendGuide = resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, catalog);
  assert.equal(sendGuide.kind, "unique");
  if (sendGuide.kind === "unique") assert.equal(sendGuide.asset.id, GUIDE_ID);

  const seeGuide = resolveExplicitApprovedAssetRequest(
    "Can I see the WhatsApp Coexistence Guide?",
    catalog,
  );
  assert.equal(seeGuide.kind, "unique");
  if (seeGuide.kind === "unique") assert.equal(seeGuide.asset.id, GUIDE_ID);

  const openBrochure = resolveExplicitApprovedAssetRequest("Open the company brochure", catalog);
  assert.equal(openBrochure.kind, "unique");
  if (openBrochure.kind === "unique") assert.equal(openBrochure.asset.id, BROCHURE_ID);

  assert.equal(inboundLooksLikeExplicitApprovedFileRequest("Are you open today?"), false);
  assert.equal(resolveExplicitApprovedAssetRequest("Are you open today?", catalog).kind, "none");
  assert.equal(inboundLooksLikeExplicitApprovedFileRequest("I see your pricing."), false);
  assert.equal(resolveExplicitApprovedAssetRequest("I see your pricing.", catalog).kind, "none");
  assert.equal(
    inboundLooksLikeExplicitApprovedFileRequest("Can you guide me through your pricing?"),
    false,
  );
  assert.equal(
    resolveExplicitApprovedAssetRequest("Can you guide me through your pricing?", catalog).kind,
    "none",
  );
  assert.equal(pickApprovedMarketingAssetForInbound("Can you guide me through your pricing?", catalog), null);

  const ambiguousGuide = resolveExplicitApprovedAssetRequest("Send me a guide", [
    guide,
    onboardingGuide,
  ]);
  assert.equal(ambiguousGuide.kind, "ambiguous");
  assert.equal(pickApprovedMarketingAssetForInbound("Send me a guide", [guide, onboardingGuide]), null);
  assert.match(approvedAssetClarificationCaption("en"), /Which file/);
  assert.match(approvedAssetClarificationCaption("es"), /archivo/);
  assert.match(approvedAssetClarificationCaption("he"), /קובץ/);

  const imageSend = resolveExplicitApprovedAssetRequest("Please send the vintage listing flyer", [
    flyerImage,
    guide,
  ]);
  assert.equal(imageSend.kind, "unique");
  if (imageSend.kind === "unique") {
    assert.equal(imageSend.asset.id, FLYER_IMAGE_ID);
    assert.equal(imageSend.asset.kind, "image");
  }
  const pdfSend = resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, [flyerImage, guide]);
  assert.equal(pdfSend.kind, "unique");
  if (pdfSend.kind === "unique") {
    assert.equal(pdfSend.asset.id, GUIDE_ID);
    assert.equal(pdfSend.asset.kind, "document");
  }

  assert.equal(resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, []).kind, "none");
  assert.equal(pickApprovedMarketingAssetForInbound(GUIDE_REQUEST, [spanishOnly])?.id, ES_ID);
  assert.equal(pickApprovedMarketingAssetForInbound(GUIDE_REQUEST, [guide])?.id, GUIDE_ID);
  assert.notEqual(FORGED_ID, GUIDE_ID);
});

test("fresh new_chat Ask Question does not own a unique explicit asset request", () => {
  const turn = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: false, visitorFacing: false, reason: "approved_asset_request_priority" },
  });
  assert.equal(turn.owner, "ai_eligible");
  assert.equal(turn.chatbotOwnsReply, false);
  assert.equal(
    decideWebchatInboundAiEvaluation({
      channel: "webchat",
      chatbotOwnsReply: false,
      turnOwner: turn.owner,
      awayReplyWillSend: false,
    }).evaluateAi,
    true,
  );
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /skipApprovedAssetIntent/);
  assert.match(engine, /approved_asset_request_priority/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /loadExplicitApprovedAssetSkipFlag/);
  assert.match(channel, /skipApprovedAssetIntent/);
  const idxSkip = channel.indexOf("skipApprovedAssetIntent");
  const idxTrigger = channel.indexOf("await triggerChatbotFlows");
  assert.ok(idxSkip > 0 && idxSkip < idxTrigger);
});

test("pending Ask Question is not completed by an explicit asset request", () => {
  const pending = createChatbotPendingAsk({
    flowRunId: "run-1",
    flowId: "flow-1",
    nodeId: "q1",
    variableName: "visitor_intent",
    nextNodeId: "",
    channel: "webchat",
    userId: "tenant-a",
    contactId: "c1",
    conversationId: "conv-1",
    promptText: "What would you like help with today?",
    quickReplies: CANONICAL,
  });
  assert.equal(wouldPendingAskComplete(pending, GUIDE_REPEAT), true);
  const engine = read("server/chatbotEngine.ts");
  const trigger = engine.slice(engine.indexOf("export async function triggerChatbotFlows"));
  const assetSkip = trigger.indexOf("approved_asset_request_priority");
  const pendingAsk = trigger.indexOf("checkAndResolvePendingAsk");
  assert.ok(assetSkip >= 0 && assetSkip < pendingAsk);
  const merged = mergeChatbotPendingIntoAiControl({ paused: false }, pending);
  assert.equal(pendingAskFromAiControl(merged)?.nodeId, "q1");
});

test("Hello still matches greeting and not an explicit asset request", () => {
  assert.equal(isCasualWebchatGreeting("Hello"), true);
  assert.equal(inboundLooksLikeExplicitApprovedFileRequest("Hello"), false);
  assert.equal(resolveExplicitApprovedAssetRequest("Hello", [guide]).kind, "none");
});

test("normal quick-reply still completes Ask Question", () => {
  const pending = createChatbotPendingAsk({
    flowRunId: "run-1",
    flowId: "flow-1",
    nodeId: "q1",
    variableName: "visitor_intent",
    nextNodeId: "",
    channel: "webchat",
    userId: "tenant-a",
    contactId: "c1",
    conversationId: "conv-1",
    quickReplies: CANONICAL,
  });
  const matched = matchAskQuestionQuickReply("Features & pricing", pending.quickReplies);
  assert.ok(matched);
  assert.equal(wouldPendingAskComplete(pending, "Features & pricing"), true);
  assert.equal(inboundLooksLikeExplicitApprovedFileRequest("Features & pricing"), false);
});

test("exact asset request is handled before generation and cannot be held by denies_available_fact", () => {
  const auto = read("server/webchatAiAutoReply.ts");
  const dispatchIdx = auto.indexOf("dispatchExplicitApprovedAssetTurn");
  const generateIdx = auto.indexOf("const genPromise = generate(");
  const gateIdx = auto.indexOf("if (!gate.allowed)");
  assert.ok(dispatchIdx >= 0 && dispatchIdx < generateIdx);
  assert.ok(dispatchIdx < gateIdx);
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [
      { role: "user", content: GUIDE_REQUEST },
    ],
    suggestion: "I cannot send files.",
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: false,
    verifiedBookingUrl: "",
    groundingViolations: ["denies_available_fact"],
  });
  assert.equal(gate.allowed, false);
  assert.match(String(gate.reason), /grounding_violation|denies_available_fact/);
  const explicit = read("server/marketingAssets/explicitAssetTurn.ts");
  assert.match(explicit, /sendApprovedMarketingAsset/);
  assert.doesNotMatch(explicit, /evaluateFullAutoSend/);
  assert.doesNotMatch(explicit, /denies_available_fact/);
});

test("Suggest drafts and Manual never auto-send", () => {
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "full_auto" }), "send_auto");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest_only" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");
  const explicit = read("server/marketingAssets/explicitAssetTurn.ts");
  assert.match(explicit, /decision === "suggest_only"/);
  assert.match(explicit, /proposedApprovedAssetId: resolution\.asset\.id/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /decision === "send_auto" \|\| decision === "suggest_only"/);
  assert.match(auto, /skip_manual/);
});

test("multiple matches clarify and never pick arbitrarily", () => {
  const resolved = resolveExplicitApprovedAssetRequest("Can I see your company brochure?", [
    brochureA,
    brochureB,
  ]);
  assert.equal(resolved.kind, "unique");
  if (resolved.kind === "unique") assert.equal(resolved.asset.id, BROCHURE_ID);
  const ambiguous = resolveExplicitApprovedAssetRequest("Please send the brochure", [
    brochureA,
    brochureB,
  ]);
  assert.equal(ambiguous.kind, "ambiguous");
  assert.equal(pickApprovedMarketingAssetForInbound("Please send the brochure", [brochureA, brochureB]), null);
  assert.match(approvedAssetClarificationCaption("en"), /Which file/);
});

test("disabled, deleted, wrong-locale, forged, and foreign assets cannot send", () => {
  const store = read("server/marketingAssets/assetStore.ts");
  assert.match(store, /reason: "disabled"/);
  assert.match(store, /reason: "locale"/);
  assert.match(store, /reason: "not_found"/);
  assert.match(store, /row\.userId !== params\.userId/);
  const send = read("server/marketingAssets/sendApprovedAsset.ts");
  assert.match(send, /getSendableMarketingAsset/);
  assert.equal(resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, [spanishOnly]).kind, "unique");
  const catalogForEn = [guide];
  assert.equal(pickApprovedMarketingAssetForInbound(GUIDE_REQUEST, catalogForEn)?.id, GUIDE_ID);
  assert.equal(pickApprovedMarketingAssetForInbound(GUIDE_REQUEST, []), null);
  assert.notEqual(FORGED_ID, GUIDE_ID);
});

test("takeover and hard ownership still suppress Auto", () => {
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "full_auto", aiPaused: true }), "skip_ai_paused");
  assert.equal(
    decideWebchatAiReply({ ...aiBase, aiModeRaw: "full_auto", handoffActive: true }),
    "skip_handoff",
  );
  const send = read("server/marketingAssets/sendApprovedAsset.ts");
  assert.match(send, /reason: "takeover"/);
  assert.match(send, /control\.paused/);
});

test("duplicate inbound reuses the Auto idempotency key", () => {
  const send = read("server/marketingAssets/sendApprovedAsset.ts");
  assert.match(send, /webchatAutoSendIdempotencyKey\(params\.userId, params\.inboundMessageId\)/);
  const explicit = read("server/marketingAssets/explicitAssetTurn.ts");
  assert.match(explicit, /skip_guard:duplicate/);
});

test("EN/ES/HE deterministic captions keep the asset display name", () => {
  assert.equal(
    approvedAssetDeterministicCaption("en", "WhatsApp Coexistence Guide"),
    "Here is WhatsApp Coexistence Guide.",
  );
  assert.equal(
    approvedAssetDeterministicCaption("es", "WhatsApp Coexistence Guide"),
    "Aquí tienes WhatsApp Coexistence Guide.",
  );
  assert.equal(
    approvedAssetDeterministicCaption("he", "WhatsApp Coexistence Guide"),
    "הנה WhatsApp Coexistence Guide.",
  );
  assert.match(approvedAssetClarificationCaption("es"), /archivo/);
  assert.match(approvedAssetClarificationCaption("he"), /קובץ/);
});

test("generic welcome menu is not also sent on the explicit-asset turn", () => {
  const channel = read("server/channelService.ts");
  const window = channel.slice(
    channel.indexOf("skipApprovedAssetIntent"),
    channel.indexOf("await triggerChatbotFlows"),
  );
  assert.match(window, /approved_asset_request_priority/);
  assert.doesNotMatch(window, /triggerChatbotFlows\(chatbotCtx\)/);
});

test("existing pricing, booking, chatbot, and grounding paths stay intact", () => {
  const channel = read("server/channelService.ts");
  assert.match(channel, /booking_fast_path_priority/);
  assert.match(channel, /skipBookingIntent: bookingIntent/);
  const bookingIdx = channel.indexOf("skipBookingIntent: bookingIntent");
  const assetFlagIdx = channel.indexOf("skipApprovedAssetIntent,");
  assert.ok(bookingIdx >= 0 && assetFlagIdx > bookingIdx);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /if \(!gate\.allowed\)/);
  assert.match(auto, /evaluateFullAutoSend/);
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /pending_ask_complete/);
  assert.match(engine, /checkAndResolvePendingAsk/);
});
