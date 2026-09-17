/**
 * Approved Marketing Materials — library, AI contract, Website Chat delivery.
 * Run: npx tsx --test tests/marketing-assets.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketingMaterialsPromptBlock,
  conversationLocaleToAssetLanguage,
  extractEmbeddedApprovedAssetId,
  inspectMarketingAssetBuffer,
  isMarketingAssetId,
  marketingAssetMatchesLocale,
  marketingAssetUploadErrorMessage,
  parseMarketingAssetWrite,
  parseSendApprovedAssetId,
  sanitizeMarketingFilename,
  stripApprovedAssetActionMarkup,
  stripInventedMarketingMediaUrls,
  toMarketingAssetCatalogItem,
} from "../shared/marketingAssets";
import { inspectWebchatPdfBuffer, isWebchatDeliverableMediaContentType } from "../shared/webchatDocumentPolicy";
import { WEBCHAT_IMAGE_MAX_BYTES } from "../shared/webchatImagePolicy";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import { toPublicWebchatMessages } from "../shared/webchatPublicMessages";
import { mergeWebchatPolledMessages } from "../shared/webchatWidgetScroll";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const EN_ID = "11111111-1111-4111-8111-111111111111";
const ES_ID = "22222222-2222-4222-8222-222222222222";
const HE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TENANT_ID = "44444444-4444-4444-8444-444444444444";

const catalogIds = new Set([EN_ID, ES_ID, HE_ID]);

test("MIME and size rejection: only sniffed JPG/PNG/WebP/PDF", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(inspectMarketingAssetBuffer(jpeg, "image/jpeg").ok, true);
  assert.equal(inspectMarketingAssetBuffer(png, "image/png").ok, true);
  assert.equal(inspectMarketingAssetBuffer(pdf, "application/pdf").ok, true);
  assert.equal(inspectWebchatPdfBuffer(pdf).ok, true);
  assert.equal(inspectMarketingAssetBuffer(jpeg, "application/pdf").ok, false);
  assert.equal(inspectMarketingAssetBuffer(pdf, "image/jpeg").ok, false);
  const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
  assert.equal(inspectMarketingAssetBuffer(svg, "image/svg+xml").ok, false);
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(32, 1)]);
  assert.equal(inspectMarketingAssetBuffer(exe).ok, false);
  const huge = Buffer.alloc(WEBCHAT_IMAGE_MAX_BYTES + 1, 0xff);
  huge[0] = 0xff;
  huge[1] = 0xd8;
  huge[2] = 0xff;
  const tooBig = inspectMarketingAssetBuffer(huge, "image/jpeg");
  assert.equal(tooBig.ok, false);
  if (!tooBig.ok) assert.equal(tooBig.reason, "too_large");
  assert.match(marketingAssetUploadErrorMessage("too_large", WEBCHAT_IMAGE_MAX_BYTES), /5 MB/);
});

test("safe filenames never expose paths", () => {
  assert.equal(sanitizeMarketingFilename("../../etc/passwd.jpg", "image/jpeg"), "passwd.jpg");
  assert.equal(sanitizeMarketingFilename("C:\\\\temp\\\\flyer.PDF", "application/pdf"), "flyer.pdf");
  assert.equal(sanitizeMarketingFilename("price list (2026).pdf", "application/pdf"), "price list (2026).pdf");
});

test("AI may select only catalog ids; invented ids and URLs are ignored", () => {
  assert.equal(parseSendApprovedAssetId(EN_ID, catalogIds), EN_ID);
  assert.equal(parseSendApprovedAssetId(OTHER_TENANT_ID, catalogIds), null);
  assert.equal(parseSendApprovedAssetId("not-an-id", catalogIds), null);
  assert.equal(parseSendApprovedAssetId("https://evil.example/flyer.pdf", catalogIds), null);
  assert.equal(isMarketingAssetId("https://cdn.example/file.pdf"), false);
  const stripped = stripInventedMarketingMediaUrls(
    "Here is the flyer https://cdn.example.r2.dev/media/tenant-b/secret.pdf thanks",
    new Set(),
  );
  assert.equal(stripped.includes("https://"), false);
  assert.equal(stripped.includes("secret.pdf"), false);
  const booking = "https://calendly.com/demo/team";
  const kept = stripInventedMarketingMediaUrls(`Book here ${booking}`, new Set([booking]));
  assert.equal(kept.includes(booking), true);
  const markup = '{"action":"send_approved_asset","assetId":"' + EN_ID + '"}';
  assert.equal(extractEmbeddedApprovedAssetId(markup), EN_ID);
  assert.equal(stripApprovedAssetActionMarkup("Sure. " + markup).includes(EN_ID), false);
});

test("disabled, deleted, and locale mismatches cannot be selected", () => {
  assert.equal(marketingAssetMatchesLocale("all", "en"), true);
  assert.equal(marketingAssetMatchesLocale("en", "en"), true);
  assert.equal(marketingAssetMatchesLocale("es", "en"), false);
  assert.equal(marketingAssetMatchesLocale("he", "he"), true);
  assert.equal(marketingAssetMatchesLocale("en", "he"), false);
  assert.equal(conversationLocaleToAssetLanguage("es-MX"), "es");
  const send = read("server/marketingAssets/sendApprovedAsset.ts");
  assert.match(send, /getSendableMarketingAsset/);
  assert.match(send, /reason: asset\.reason/);
  assert.match(send, /reason: "inbound_provenance"/);
  assert.match(send, /control\.paused/);
  const store = read("server/marketingAssets/assetStore.ts");
  assert.match(store, /deletedAt \|\| !row\.enabled/);
  assert.match(store, /reason: "disabled"/);
  assert.match(store, /reason: "locale"/);
  assert.match(store, /marketingAssetMatchesLocale/);
});

test("EN/ES/HE catalog filtering and prompt never includes URLs", () => {
  const items = [
    toMarketingAssetCatalogItem({
      id: EN_ID,
      displayName: "English flyer",
      language: "en",
      kind: "image",
      topics: ["promo"],
    })!,
    toMarketingAssetCatalogItem({
      id: ES_ID,
      displayName: "Folleto",
      language: "es",
      kind: "document",
    })!,
    toMarketingAssetCatalogItem({
      id: HE_ID,
      displayName: "חוברת",
      language: "he",
      kind: "document",
    })!,
  ];
  const enOnly = items.filter((item) => marketingAssetMatchesLocale(item.language, "en"));
  assert.deepEqual(enOnly.map((i) => i.id), [EN_ID]);
  const esOnly = items.filter((item) => marketingAssetMatchesLocale(item.language, "es"));
  assert.deepEqual(esOnly.map((i) => i.id), [ES_ID]);
  const heOnly = items.filter((item) => marketingAssetMatchesLocale(item.language, "he"));
  assert.deepEqual(heOnly.map((i) => i.id), [HE_ID]);
  const allLang = toMarketingAssetCatalogItem({
    id: EN_ID,
    displayName: "Shared",
    language: "all",
    kind: "image",
  })!;
  assert.equal(marketingAssetMatchesLocale(allLang.language, "he"), true);
  const block = buildMarketingMaterialsPromptBlock(items);
  assert.match(block, /sendApprovedAssetId/);
  assert.doesNotMatch(block, /https?:\/\//);
  assert.doesNotMatch(block, /mediaUrl|storageKey|r2\.dev|CLOUDFLARE/);
  const empty = buildMarketingMaterialsPromptBlock([]);
  assert.match(empty, /answer in text only/i);
});

test("tenant isolation and unauthorized public access", () => {
  const store = read("server/marketingAssets/assetStore.ts");
  assert.match(store, /eq\(workspaceMarketingAssets\.userId, userId\)/);
  assert.match(store, /eq\(workspaceMarketingAssets\.id, assetId\)/);
  const routes = read("server/marketingAssets/routes.ts");
  assert.match(routes, /requireMarketingAssetsAdmin/);
  assert.match(routes, /readOwnedStoredMedia/);
  assert.doesNotMatch(routes, /CLOUDFLARE_R2_SECRET|R2_ACCESS_KEY|PRIVATE_OBJECT_DIR/);
  assert.doesNotMatch(routes, /fileUrl: row\.mediaUrl/);
  assert.match(routes, /\/api\/marketing-assets\/\$\{view\.id\}\/file/);
  const webhooks = read("server/routes/webhooks.ts");
  const mediaGet = webhooks.slice(webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/media/:messageId"'));
  assert.match(mediaGet, /verifyWebchatVisitorMedia/);
  assert.match(mediaGet, /message\.userId !== access\.owner\.userId/);
  assert.match(mediaGet, /loadWebchatVisitorMediaBytes/);
  assert.doesNotMatch(mediaGet.slice(0, 2500), /req\.user/);
});

test("AI Auto sends a validated asset; Suggest/Manual/takeover/chatbot do not", () => {
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /sendApprovedMarketingAsset/);
  assert.match(auto, /sendApprovedAssetId/);
  const sendIdx = auto.indexOf("sendApprovedMarketingAsset");
  const gateIdx = auto.indexOf("if (!gate.allowed)");
  assert.ok(sendIdx > gateIdx, "asset send happens only after Auto gate allows");
  const persistDraftIdx = auto.indexOf("if (decision === \"suggest_only\")");
  assert.ok(persistDraftIdx >= 0 && persistDraftIdx < sendIdx, "Suggest persists a draft before asset send");
  assert.match(auto, /webchatAutoSendIdempotencyKey/);
  const send = read("server/marketingAssets/sendApprovedAsset.ts");
  assert.match(send, /webchatAutoSendIdempotencyKey\(params\.userId, params\.inboundMessageId\)/);
  assert.match(send, /inbound\.direction !== "inbound"/);
  const ai = read("server/aiService.ts");
  assert.match(ai, /sendApprovedAssetId/);
  assert.match(ai, /listEnabledMarketingAssetCatalog/);
  assert.match(ai, /parseSendApprovedAssetId/);
  assert.match(ai, /stripInventedMarketingMediaUrls/);
  assert.doesNotMatch(ai, /mediaUrl: catalog/);
  const modes = {
    rolloutEnabled: true,
    allowlisted: true,
    widgetEnabled: true,
    hasAiBrainAccess: true,
    planIsProOrTrial: true,
    chatbotOwnsReply: false,
    bookingOwnsReply: false,
    crmFallbackOwnsReply: false,
    handoffActive: false,
    aiPaused: false,
    automationsPaused: false,
    optedOut: false,
    rateLimited: false,
  };
  assert.equal(decideWebchatAiReply({ ...modes, aiModeRaw: "full_auto" }), "send_auto");
  assert.equal(decideWebchatAiReply({ ...modes, aiModeRaw: "suggest_only" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...modes, aiModeRaw: "off" }), "skip_manual");
  assert.equal(decideWebchatAiReply({ ...modes, chatbotOwnsReply: true, aiModeRaw: "full_auto" }), "skip_chatbot_owns");
  assert.equal(decideWebchatAiReply({ ...modes, aiPaused: true, aiModeRaw: "full_auto" }), "skip_ai_paused");
});

test("duplicate inbound send-once uses the existing Auto idempotency key", () => {
  const key = webchatAutoSendIdempotencyKey("ws-a", "in-1");
  assert.equal(webchatAutoSendIdempotencyKey("ws-a", "in-1"), key);
  assert.notEqual(webchatAutoSendIdempotencyKey("ws-a", "in-2"), key);
  const send = read("server/marketingAssets/sendApprovedAsset.ts");
  assert.match(send, /withAutomationSendGuard/);
  assert.match(send, /webchatAutoSendIdempotencyKey/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /skip_guard:duplicate/);
});

test("image and PDF polling persist through refresh and render on desktop/mobile", () => {
  assert.equal(isWebchatDeliverableMediaContentType("image"), true);
  assert.equal(isWebchatDeliverableMediaContentType("document"), true);
  assert.equal(isWebchatDeliverableMediaContentType("video"), false);
  const signed = "/api/webchat/wgt_a/visitor/media/m1?exp=1&sig=abc";
  const pdfMsg = {
    id: "m1",
    direction: "outbound" as const,
    content: "Brochure attached",
    contentType: "document",
    mediaUrl: "https://cdn.example/secret.pdf",
    mediaFilename: "brochure.pdf",
    createdAt: "2026-09-16T00:00:00.000Z",
    status: "sent",
  };
  const polled = toPublicWebchatMessages([pdfMsg], () => signed);
  assert.equal(polled[0].mediaUrl, signed);
  assert.equal(polled[0].mediaFilename, "brochure.pdf");
  const refreshed = mergeWebchatPolledMessages(polled, [
    { ...polled[0], mediaUrl: signed + "2" },
  ]);
  assert.equal(refreshed[0].id, "m1");
  assert.equal(refreshed[0].mediaFilename, "brochure.pdf");
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WebchatDocumentBubble/);
  assert.match(frame, /max-w-\[80%\]/);
  const bubble = read("client/src/components/webchat/WebchatDocumentBubble.tsx");
  assert.match(bubble, /webchat-document-open/);
  assert.match(bubble, /webchat-document-download/);
  assert.match(bubble, /download=1/);
  assert.match(bubble, /max-w-full/);
  const adapter = read("server/channelAdapters.ts");
  assert.match(adapter, /isWebchatDeliverableMediaContentType/);
  const poll = read("server/routes/webhooks.ts");
  assert.match(poll, /isWebchatDeliverableMediaContentType\(message\.contentType\)/);
});

test("reuses existing storage and never duplicates an upload system", () => {
  const routes = read("server/marketingAssets/routes.ts");
  assert.match(routes, /uploadOutboundUserMedia/);
  assert.match(routes, /originChannel: "marketing-assets"/);
  assert.match(routes, /inspectMarketingAssetBuffer/);
  const schema = read("shared/schema.ts");
  assert.match(schema, /workspaceMarketingAssets/);
  assert.match(schema, /workspace_marketing_assets/);
  const migration = read("migrations/0092_workspace_marketing_assets.sql");
  assert.match(migration, /deleted_at/);
  assert.match(migration, /user_id varchar NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  const patch = read("server/startupSchemaPatches.ts");
  assert.match(patch, /0092_workspace_marketing_assets/);
  const ui = read("client/src/components/aibrain/MarketingMaterialsSettings.tsx");
  assert.match(ui, /Marketing Materials/);
  assert.match(ui, /btn-marketing-delete-confirm/);
  const brain = read("client/src/pages/AIBrain.tsx");
  assert.match(brain, /MarketingMaterialsSettings/);
  const settings = read("client/src/pages/Settings.tsx");
  assert.match(settings, /MarketingMaterialsSettings/);
  const registered = read("server/routes.ts");
  assert.match(registered, /registerMarketingAssetRoutes/);
});

test("write validation and fallback when no asset matches", () => {
  const parsed = parseMarketingAssetWrite({
    displayName: "  Summer Flyer  ",
    description: "Promo",
    language: "es",
    topics: "promo, listings",
    enabled: true,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.displayName, "Summer Flyer");
    assert.equal(parsed.data.language, "es");
    assert.deepEqual(parsed.data.topics, ["promo", "listings"]);
  }
  assert.equal(parseMarketingAssetWrite({ displayName: "" }).ok, false);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /Disabled, deleted, locale mismatch, or invented id/);
  const prompt = buildMarketingMaterialsPromptBlock([]);
  assert.match(prompt, /Do not invent a flyer/i);
});
