/**
 * Unified Inbox: manual WhatsApp media vs listing-recommendation attachment guard.
 * Run: npx tsx --test tests/inbox-composer-attachment-guard.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { shouldBlockListingRecommendationMissingText } from "../shared/inboxComposerAttachmentGuard";
import {
  buildListingComposerMessage,
  listingComposerDraftIncludesRequiredDetails,
} from "../shared/inventory/inventoryComposerDraft";
import { buildListingShareUrl } from "../shared/inventory/listingViewUrl";
import {
  buildMetaOutboundSteps,
  metaOutboundRequiresTextWithMedia,
} from "../shared/metaOutboundMessagePlan";

describe("manual WhatsApp image send (not listing recommendation)", () => {
  it("non-Realtor workspace + image-only WhatsApp → no listing validation", () => {
    // Manual upload path used by every industry; empty caption must send.
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: "manual_upload",
        messageText: "",
      }),
      false,
    );
  });

  it("allows image-only when attachment is a manual upload", () => {
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: "manual_upload",
        messageText: "",
      }),
      false,
    );
  });

  it("allows image + ordinary caption", () => {
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: "manual_upload",
        messageText: "Here is the photo from today",
      }),
      false,
    );
  });

  it("Realtor workspace alone does not treat every image as a listing recommendation", () => {
    // No listing_recommendation source → never block, even with empty text.
    // Guard API has no realtor/RGE/inventory flags — those must never be inferred.
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: undefined,
        messageText: "",
      }),
      false,
    );
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: null,
        messageText: "",
      }),
      false,
    );
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: "manual_upload",
        messageText: "",
      }),
      false,
    );
  });

  it("guard function signature has no realtor/RGE/inventory inference inputs", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "shared/inboxComposerAttachmentGuard.ts"),
      "utf8",
    );
    // Parameter surface: only attachment marker + message text — no workspace flags.
    assert.match(
      src,
      /shouldBlockListingRecommendationMissingText\(params:\s*\{[\s\S]*?hasPendingAttachment: boolean;[\s\S]*?attachmentSource: InboxPendingAttachmentSource[\s\S]*?messageText: string;[\s\S]*?\}\): boolean/,
    );
    assert.doesNotMatch(src, /params\.(realtor|rge|growthEngine|isRealtor|inventoryContext|mediaType)/i);
    assert.match(src, /attachmentSource !== "listing_recommendation"/);
  });

  it("text-only send remains unaffected (no attachment → never blocks)", () => {
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: false,
        attachmentSource: "listing_recommendation",
        messageText: "Hello from WhachatCRM",
      }),
      false,
    );
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: false,
        attachmentSource: "manual_upload",
        messageText: "",
      }),
      false,
    );
  });
});

describe("explicit listing recommendation still requires details text", () => {
  it("blocks listing-recommendation photo when message text is empty", () => {
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: "listing_recommendation",
        messageText: "   ",
      }),
      true,
    );
  });

  it("allows listing-recommendation photo when listing details text is present", () => {
    const listingId = "33333333-3333-4333-8333-333333333333";
    const viewUrl = buildListingShareUrl(listingId, "https://app.whachatcrm.com");
    const composer = buildListingComposerMessage({
      listing: {
        listingId,
        priceCents: 26_900_000,
        beds: 2,
        baths: 2,
        city: "Pompano Beach",
        state: "FL",
        propertyType: "condo",
        listingUrl: null,
        photos: [{ url: "https://cdn.example.com/listing.jpg", order: 0 }],
      },
      contactFirstName: "Susu",
      introDraft: "Hi Susu, I found a condo in Pompano Beach that matches what you're looking for:",
      featureHints: ["Modern condo with ocean/golf view features"],
      viewUrl,
    });
    assert.equal(
      listingComposerDraftIncludesRequiredDetails(composer.text, {
        listingId,
        priceCents: 26_900_000,
        beds: 2,
        baths: 2,
        city: "Pompano Beach",
        listingUrl: null,
      }, { viewUrl }),
      true,
    );
    assert.equal(
      shouldBlockListingRecommendationMissingText({
        hasPendingAttachment: true,
        attachmentSource: "listing_recommendation",
        messageText: composer.text,
      }),
      false,
    );
  });
});

describe("Coexistence / Meta media path once validation passes", () => {
  it("image-only plan is a normal attachment step (no forced listing text step)", () => {
    const steps = buildMetaOutboundSteps({
      content: "",
      mediaUrl: "https://cdn.example.com/manual.jpg",
      contentType: "image",
    });
    assert.equal(steps.length, 1);
    assert.equal(steps[0].kind, "attachment");
    assert.equal(metaOutboundRequiresTextWithMedia(steps), true);
  });

  it("image + caption still uses text then attachment sequencing", () => {
    const steps = buildMetaOutboundSteps({
      content: "Check this out",
      mediaUrl: "https://cdn.example.com/manual.jpg",
      contentType: "image",
    });
    assert.equal(steps.length, 2);
    assert.equal(steps[0].kind, "text");
    assert.equal(steps[1].kind, "attachment");
  });

  it("WhatsAppAdapter media send uses optional caption (no listing-text gate)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/channelAdapters.ts"),
      "utf8",
    );
    assert.match(src, /sendWhatsAppMedia\(/);
    assert.match(
      src,
      /params\.content \|\| undefined/,
    );
    assert.doesNotMatch(src, /Add listing details text/);
    assert.doesNotMatch(src, /listing_recommendation/);
  });
});

describe("UnifiedInbox wires explicit listing source only on inventory attach", () => {
  it("manual upload path marks manual_upload; listing attach marks listing_recommendation", () => {
    const hub = fs.readFileSync(
      path.join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"),
      "utf8",
    );
    assert.match(hub, /shouldBlockListingRecommendationMissingText/);
    assert.match(hub, /attachmentSource:\s*"manual_upload"/);
    assert.match(hub, /attachmentSource:\s*"listing_recommendation"/);
    // Old blanket guard must not remain.
    assert.doesNotMatch(
      hub,
      /if\s*\(\s*pendingFile\s*&&\s*!messageInput\.trim\(\)\s*\)/,
    );
  });
});
