/**
 * Throwaway TEST_DATABASE_URL only. Never writes production tenant data.
 * Reproduces “Can you send me the WhatsApp Coexistence Guide?” first-turn matching.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import sharp from "sharp";
import { proveTestDatabaseIsolation } from "./proof-test-db-isolation";
import { prepareDbTestEnvironment, teardownTestUser } from "../tests/helpers/dbTestGuard";

loadDotenv({ override: false });

const GUIDE_REQUEST = "Can you send me the WhatsApp Coexistence Guide?";
const QUALIFIER = "WhachatCRM Website Lead Qualifier";

function disableProductionObjectStorage(): void {
  delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  delete process.env.CLOUDFLARE_R2_BUCKET;
  delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
  delete process.env.PRIVATE_OBJECT_DIR;
}

async function main(): Promise<void> {
  const isolated = await proveTestDatabaseIsolation();
  assert.match(isolated.test.host, /plain-surf|ep-plain-surf/i);
  assert.doesNotMatch(isolated.test.host, /polished-boat/i);
  disableProductionObjectStorage();
  if (!String(process.env.SESSION_SECRET || "").trim()) {
    process.env.SESSION_SECRET = "test-session-secret-for-throwaway-db-proof";
  }
  process.env.WEBCHAT_SERVER_AI_AUTO = "1";
  const guard = prepareDbTestEnvironment("proof-coexistence-guide-inbound.ts");
  console.log("[proof] using", guard.source, guard.hostLabel);

  const { storage } = await import("../server/storage");
  const { channelService } = await import("../server/channelService");
  const { createMarketingAsset } = await import("../server/marketingAssets/assetStore");
  const { listEnabledMarketingAssetCatalog } = await import("../server/marketingAssets/assetStore");
  const { resolveExplicitApprovedAssetRequest } = await import("../shared/marketingAssets");
  const { uploadOutboundUserMedia } = await import("../server/mediaStorageService");
  const { pendingAskFromAiControl } = await import("../shared/chatbotAskQuestion");
  const { detectHighConfidenceBookingIntent } = await import("../shared/bookingIntent");

  let userId: string | undefined;
  try {
    const user = await storage.createUser({
      email: `mm-guide-proof-${Date.now()}@example.test`,
      password: "test-password",
      name: "MM Guide Proof",
    });
    userId = user.id;
    await storage.updateUser(user.id, {
      widgetSettings: { enabled: true, color: "#10b981", position: "right" },
    });
    await storage.upsertAiSettings(user.id, { aiMode: "full_auto" });
    await storage.createChatbotFlow({
      userId: user.id,
      name: QUALIFIER,
      description: "Lead qualifier",
      isActive: true,
      triggerOnNewChat: true,
      triggerChannels: ["webchat"],
      triggerKeywords: [],
      nodes: [
        {
          id: "start",
          type: "question",
          data: {
            content: QUALIFIER,
            variableName: "visitor_intent",
            options: [
              { label: "Features & pricing", value: "Features & pricing" },
              { label: "Find my solution", value: "Find my solution" },
              { label: "Book a demo", value: "Book a demo" },
            ],
          },
        },
      ],
      edges: [],
    });

    const png = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 16, g: 185, b: 129 } },
    })
      .png()
      .toBuffer();
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    const imageUp = await uploadOutboundUserMedia({
      userId: user.id,
      buffer: png,
      contentType: "image/png",
      originChannel: "marketing-assets",
    });
    const pdfUp = await uploadOutboundUserMedia({
      userId: user.id,
      buffer: pdf,
      contentType: "application/pdf",
      originChannel: "marketing-assets",
    });
    const image = await createMarketingAsset({
      userId: user.id,
      displayName: "WhatsApp Coexistence",
      description:
        "A visual guide for using WhatsApp Business App and WhachatCRM with the same phone number",
      language: "English",
      topics: [],
      enabled: true,
      kind: "image",
      mimeType: "image/png",
      originalFilename: "whatsapp-coexistence-guide.png",
      mediaUrl: imageUp.mediaUrl,
      mediaStorageKey: imageUp.mediaStorageKey,
      mediaSize: png.length,
    });
    const pricingPdf = await createMarketingAsset({
      userId: user.id,
      displayName: "Pricing PDF",
      description: "WhatsApp pricing",
      language: "en",
      topics: ["whatsapp", "pricing"],
      enabled: true,
      kind: "document",
      mimeType: "application/pdf",
      originalFilename: "whatsapp-pricing.pdf",
      mediaUrl: pdfUp.mediaUrl,
      mediaStorageKey: pdfUp.mediaStorageKey,
      mediaSize: pdf.length,
    });

    const catalog = await listEnabledMarketingAssetCatalog(user.id, "en", GUIDE_REQUEST, { limit: 200 });
    assert.ok(catalog.enabledCount >= 2);
    assert.ok(catalog.localeMatchedCount >= 2);
    const resolved = resolveExplicitApprovedAssetRequest(GUIDE_REQUEST, catalog.items);
    assert.equal(resolved.kind, "unique");
    if (resolved.kind === "unique") {
      assert.equal(resolved.asset.id, image.id);
      assert.equal(resolved.asset.kind, "image");
    }

    const first = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: randomUUID(),
      contactName: "Website Visitor",
      content: GUIDE_REQUEST,
      contentType: "text",
      externalMessageId: `guide_${Date.now()}`,
      visitorLocale: "en",
    });
    assert.equal(first.success, true);
    assert.equal(first.chatbotState.willFire, false);
    const firstMsgs = await storage.getMessages(first.conversation!.id, 20);
    const qualifierHits = firstMsgs.filter((m) => (m.content || "").includes(QUALIFIER));
    assert.equal(qualifierHits.length, 0, "qualifier must not fire on unique asset request");
    const imageOut = firstMsgs.filter(
      (m) => m.direction === "outbound" && (m.contentType === "image" || m.mediaType === "image"),
    );
    assert.equal(imageOut.length, 1, "exactly one approved image");
    assert.match(String(imageOut[0]?.content || ""), /WhatsApp Coexistence/);
    assert.equal(imageOut[0]?.generationMeta && (imageOut[0]!.generationMeta as { approvedAssetId?: string }).approvedAssetId, image.id);

    const hello = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: randomUUID(),
      contactName: "Website Visitor",
      content: "Hello",
      contentType: "text",
      externalMessageId: `hello_${Date.now()}`,
      visitorLocale: "en",
    });
    assert.equal(hello.chatbotState.willFire, true);
    const helloMsgs = await storage.getMessages(hello.conversation!.id, 20);
    assert.ok(helloMsgs.some((m) => (m.content || "").includes(QUALIFIER)));

    const pendingVisitor = randomUUID();
    const pendingHello = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: pendingVisitor,
      contactName: "Website Visitor",
      content: "Hello",
      contentType: "text",
      externalMessageId: `pending_hello_${Date.now()}`,
      visitorLocale: "en",
    });
    const pendingBefore = pendingAskFromAiControl(
      ((await storage.getConversation(pendingHello.conversation!.id)) || pendingHello.conversation)!.aiControl,
    );
    assert.ok(pendingBefore, "Hello should leave a pending Ask");
    const pendingGuide = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: pendingVisitor,
      contactName: "Website Visitor",
      content: GUIDE_REQUEST,
      contentType: "text",
      externalMessageId: `pending_guide_${Date.now()}`,
      visitorLocale: "en",
    });
    const pendingAfter = pendingAskFromAiControl(
      ((await storage.getConversation(pendingGuide.conversation!.id)) || pendingGuide.conversation)!.aiControl,
    );
    assert.ok(pendingAfter, "explicit asset request must not consume pending Ask");
    assert.equal(pendingAfter?.nodeId, pendingBefore?.nodeId);
    const pendingMsgs = await storage.getMessages(pendingGuide.conversation!.id, 40);
    assert.equal(
      pendingMsgs.filter((m) => m.direction === "outbound" && (m.contentType === "image" || m.mediaType === "image")).length,
      1,
    );

    await storage.upsertAiSettings(user.id, { aiMode: "suggest_only" });
    const suggest = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: randomUUID(),
      contactName: "Website Visitor",
      content: GUIDE_REQUEST,
      contentType: "text",
      externalMessageId: `suggest_${Date.now()}`,
      visitorLocale: "en",
    });
    const suggestMsgs = await storage.getMessages(suggest.conversation!.id, 20);
    assert.equal(
      suggestMsgs.filter((m) => m.direction === "outbound" && (m.contentType === "image" || m.mediaType === "image")).length,
      0,
      "Suggest must not auto-send",
    );

    await storage.upsertAiSettings(user.id, { aiMode: "off" });
    const manual = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: randomUUID(),
      contactName: "Website Visitor",
      content: GUIDE_REQUEST,
      contentType: "text",
      externalMessageId: `manual_${Date.now()}`,
      visitorLocale: "en",
    });
    const manualMsgs = await storage.getMessages(manual.conversation!.id, 20);
    assert.equal(
      manualMsgs.filter((m) => m.direction === "outbound" && (m.contentType === "image" || m.mediaType === "image")).length,
      0,
      "Manual must not auto-send",
    );

    await storage.upsertAiSettings(user.id, { aiMode: "full_auto" });
    const pdfReq = "Please send the pricing PDF";
    const pdfResolved = resolveExplicitApprovedAssetRequest(
      pdfReq,
      (await listEnabledMarketingAssetCatalog(user.id, "en", pdfReq, { limit: 200 })).items,
    );
    assert.equal(pdfResolved.kind, "unique");
    if (pdfResolved.kind === "unique") assert.equal(pdfResolved.asset.id, pricingPdf.id);
    const pdfTurn = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: randomUUID(),
      contactName: "Website Visitor",
      content: pdfReq,
      contentType: "text",
      externalMessageId: `pdf_${Date.now()}`,
      visitorLocale: "en",
    });
    const pdfMsgs = await storage.getMessages(pdfTurn.conversation!.id, 20);
    assert.equal(
      pdfMsgs.filter((m) => m.direction === "outbound" && (m.contentType === "document" || m.mediaType === "document")).length,
      1,
    );

    const dupId = `dup_${Date.now()}`;
    const dupVisitor = randomUUID();
    const dup1 = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: dupVisitor,
      contactName: "Website Visitor",
      content: GUIDE_REQUEST,
      contentType: "text",
      externalMessageId: dupId,
      visitorLocale: "en",
    });
    const dup2 = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: dupVisitor,
      contactName: "Website Visitor",
      content: GUIDE_REQUEST,
      contentType: "text",
      externalMessageId: dupId,
      visitorLocale: "en",
    });
    assert.equal(dup2.deduped, true);
    const dupMsgs = await storage.getMessages(dup1.conversation!.id, 20);
    assert.equal(
      dupMsgs.filter((m) => m.direction === "outbound" && (m.contentType === "image" || m.mediaType === "image")).length,
      1,
    );

    const bookingText = "I want to book a call tomorrow";
    assert.equal(detectHighConfidenceBookingIntent(bookingText), true);
    const booking = await channelService.processIncomingMessage({
      userId: user.id,
      channel: "webchat",
      channelContactId: randomUUID(),
      contactName: "Website Visitor",
      content: bookingText,
      contentType: "text",
      externalMessageId: `book_${Date.now()}`,
      visitorLocale: "en",
    });
    const bookingMsgs = await storage.getMessages(booking.conversation!.id, 20);
    assert.equal(
      bookingMsgs.filter((m) => m.direction === "outbound" && (m.contentType === "image" || m.mediaType === "image")).length,
      0,
    );

    console.log("[proof] OK — unique coexistence image, no qualifier, Hello still qualifies");
  } finally {
    await teardownTestUser(userId, "proof-coexistence-guide-inbound");
  }
}

main().catch((err) => {
  console.error("[proof] FAILED", err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
