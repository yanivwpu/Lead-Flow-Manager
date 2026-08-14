/**
 * Regular email attachments — policy, UI mount, secure fetch contracts.
 * Run: npx tsx --test tests/email-attachments.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  buildEmailAttachmentPath,
  emailAttachmentFileKind,
  formatEmailAttachmentSize,
  isEmailAttachmentInlinePreviewMime,
  isRegularEmailAttachment,
  listRegularEmailAttachments,
  mayRenderEmailAttachmentInline,
  sanitizeEmailAttachmentFilename,
} from "../shared/emailAttachmentPolicy";
import type { NormalizedEmailAttachmentMeta } from "../shared/emailChannel";

const root = process.cwd();
function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("regular vs CID attachment separation", () => {
  it("includes normal file attachments; excludes CID/inline", () => {
    const rows: NormalizedEmailAttachmentMeta[] = [
      {
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 12000,
        providerAttachmentId: "att-1",
      },
      {
        filename: "inline-cid",
        mimeType: "image/png",
        size: 800,
        providerAttachmentId: "att-2",
        contentId: "ii_abc",
        isInline: true,
      },
      {
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 50_000,
        providerAttachmentId: "att-3",
      },
    ];
    const regular = listRegularEmailAttachments(rows);
    assert.equal(regular.length, 2);
    assert.equal(regular[0].filename, "photo.jpg");
    assert.equal(regular[1].filename, "report.pdf");
    assert.equal(isRegularEmailAttachment(rows[1]), false);
  });

  it("formats size and kinds", () => {
    assert.equal(formatEmailAttachmentSize(512), "512 B");
    assert.match(String(formatEmailAttachmentSize(2048)), /KB/);
    assert.equal(emailAttachmentFileKind("image/png", "a.png"), "image");
    assert.equal(emailAttachmentFileKind("application/pdf", "a.pdf"), "pdf");
    assert.equal(emailAttachmentFileKind("application/zip", "a.zip"), "document");
  });

  it("SVG and unknown are not inline-previewable; safe images are", () => {
    assert.equal(isEmailAttachmentInlinePreviewMime("image/jpeg"), true);
    assert.equal(isEmailAttachmentInlinePreviewMime("image/svg+xml"), false);
    assert.equal(mayRenderEmailAttachmentInline("image/svg+xml"), false);
    assert.equal(mayRenderEmailAttachmentInline("application/pdf"), true);
    assert.equal(mayRenderEmailAttachmentInline("application/octet-stream"), false);
  });

  it("builds authenticated same-origin attachment paths", () => {
    const p = buildEmailAttachmentPath("msg-1", "att-xyz");
    assert.match(p, /^\/api\/messages\/msg-1\/email-attachment\?/);
    assert.match(p, /attachmentId=att-xyz/);
    assert.match(buildEmailAttachmentPath("msg-1", "att-xyz", { download: true }), /download=1/);
    assert.equal(sanitizeEmailAttachmentFilename('evil\n"name".jpg'), "evil__name_.jpg");
  });
});

describe("UI mount + full-width section", () => {
  it("EmailThreadMessage mounts attachments after body, outside HTML frame", () => {
    const thread = read("client/src/components/inbox/conversation/EmailThreadMessage.tsx");
    const section = read("client/src/components/inbox/conversation/EmailAttachmentsSection.tsx");
    assert.match(thread, /EmailAttachmentsSection/);
    assert.match(thread, /email-document-body-wrap/);
    const bodyIdx = thread.indexOf('data-testid="email-document-body-wrap"');
    const attIdx = thread.indexOf("<EmailAttachmentsSection");
    assert.ok(bodyIdx >= 0 && attIdx > bodyIdx, "attachments after body");
    assert.match(section, /data-testid=\"email-attachments-section\"/);
    assert.match(section, /w-full min-w-0 max-w-full/);
    assert.match(section, /email-attachment-filename/);
    assert.match(section, /email-attachment-thumbnail/);
    assert.match(section, /email-attachment-download/);
    assert.doesNotMatch(section, /sm:max-w-\[70%\]/);
    assert.doesNotMatch(section, /bg-\[#d9fdd3\]/);
  });

  it("EmailMessageBody / EmailHtmlFrame unchanged for CID and remote images", () => {
    const body = read("client/src/components/inbox/EmailMessageBody.tsx");
    const frame = read("client/src/components/inbox/EmailHtmlFrame.tsx");
    const sanitize = read("server/emailChannel/htmlSanitize.ts");
    assert.match(body, /EmailHtmlFrame/);
    assert.doesNotMatch(body, /EmailAttachmentsSection/);
    assert.match(frame, /sandbox/);
    assert.match(sanitize, /buildEmailRemoteProxySrc|EMAIL_IMAGE_PROXY|cid:/i);
  });
});

describe("secure fetch route + authz contracts", () => {
  it("route wires fetchEmailAttachmentForUser with auth and safety headers", () => {
    const routes = read("server/routes/emailChannel.ts");
    const svc = read("server/emailChannel/emailAttachments.ts");
    assert.match(routes, /\/api\/messages\/:messageId\/email-attachment/);
    assert.match(routes, /requireAuth/);
    assert.match(routes, /fetchEmailAttachmentForUser/);
    assert.match(routes, /X-Content-Type-Options/);
    assert.match(routes, /nosniff/);
    assert.match(routes, /Content-Disposition/);
    assert.match(svc, /workspaceUserId/);
    assert.match(svc, /mailbox\.workspaceUserId/);
    assert.match(svc, /attachment_mismatch|attachment_not_on_message/);
    assert.match(svc, /providerAttachmentId/);
    assert.match(svc, /externalMessageId/);
    assert.match(svc, /EMAIL_ATTACHMENT_MAX_BYTES/);
    assert.match(svc, /image\/svg\+xml/);
    assert.match(svc, /asAttachment/);
    // Must not expose tokens to client
    assert.doesNotMatch(routes, /accessToken.*res\.(json|send)/);
  });

  it("persisted metadata path reused (no schema change required)", () => {
    const persist = read("server/emailChannel/persistInbound.ts");
    const gmail = read("server/emailChannel/gmailProvider.ts");
    const schema = read("shared/schema.ts");
    assert.match(persist, /attachmentMetadata:\s*normalized\.attachments/);
    assert.match(persist, /hasAttachments/);
    assert.match(gmail, /providerAttachmentId/);
    assert.match(gmail, /extractAttachments/);
    assert.match(schema, /attachmentMetadata/);
    assert.match(schema, /hasAttachments/);
  });
});

describe("regression: channel-adaptive + phase2 paths", () => {
  it("WhatsApp bubble path and CID/proxy wiring remain", () => {
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    const phase2 = read("tests/email-image-rendering-phase2.test.ts");
    assert.match(inbox, /chatBubbleShellClassName/);
    assert.match(inbox, /EmailThreadMessage/);
    assert.match(phase2, /email-inline/);
    assert.match(phase2, /EMAIL_IMAGE_PROXY_PATH|image-proxy/);
  });
});
