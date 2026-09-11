/**
 * Business Profile logo upload: 88 KB raster, JSON-size, validation, tenant isolation.
 * Run: npx tsx --test tests/business-profile-logo.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WEBCHAT_IMAGE_MAX_BYTES } from "../shared/webchatImagePolicy";
import {
  BUSINESS_PROFILE_JSON_BODY_MAX_BYTES,
  BUSINESS_PROFILE_LOGO_MAX_BYTES,
  BUSINESS_PROFILE_LOGO_UPLOAD_PATH,
  businessProfilePatchJsonBytes,
  companyLogoForPatch,
  isFirstPartyBusinessProfileLogoPath,
  persistBusinessProfileCompanyLogo,
  runBusinessProfileLogoUpload,
  validateBusinessProfileLogoFileMeta,
  type BusinessProfileLogoUploadLock,
} from "../shared/businessProfileLogo";
import { buildBusinessProfileSaveBody, businessProfilePatchSchema } from "../shared/businessProfileSchema";
import { inspectBusinessProfileLogoUpload } from "../server/businessProfileLogoUpload";
import {
  ownedPublicUploadStorageKey,
  storeWidgetLogoRaster,
} from "../server/mediaStorageService";
import { saveBusinessProfileForUser } from "../server/businessProfileService";
import type { AiBusinessKnowledge } from "@shared/schema";
import type { BusinessProfileResponse } from "@shared/businessProfileSchema";
import { hydrateBusinessProfileDisplayName } from "../shared/businessProfileSchema";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

function jpegOfSize(bytes: number): Uint8Array {
  const buf = new Uint8Array(bytes);
  buf.set(JPEG_HEADER, 0);
  buf[bytes - 2] = 0xff;
  buf[bytes - 1] = 0xd9;
  return buf;
}

const JPEG = jpegOfSize(64);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const MZ = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);

function fakeFile(name: string, type: string, bytes: Uint8Array) {
  return new File([bytes], name, { type });
}

function emptyProfile(overrides: Partial<BusinessProfileResponse> = {}): BusinessProfileResponse {
  return {
    avatarUrl: null,
    displayName: "",
    businessName: "",
    companyLogo: null,
    publicPhone: "",
    publicEmail: "",
    publicWebsite: "",
    aboutText: "",
    calendlyConnected: false,
    calendlyEventTypeName: "",
    calendlySchedulingUrl: "",
    publishListingsPublicly: false,
    ...overrides,
  };
}

function createTenantStore() {
  const rows = new Map<string, Partial<AiBusinessKnowledge> & { userId: string }>();
  const deleted: Array<{ userId: string; url: string }> = [];

  return {
    rows,
    deleted,
    deps: {
      upsertKnowledge: async (userId: string, updates: Partial<AiBusinessKnowledge>) => {
        const existing = rows.get(userId);
        const next = { ...(existing || { userId }), ...updates, userId };
        rows.set(userId, next);
        return next;
      },
      loadProfile: async (userId: string) => {
        const row = rows.get(userId);
        return emptyProfile({
          displayName: hydrateBusinessProfileDisplayName({ knowledgeDisplayName: row?.displayName }),
          businessName: String(row?.businessName || ""),
          companyLogo: row?.companyLogo || null,
        });
      },
      isRgeInstalled: async () => false,
      loadExistingKnowledge: async (userId: string) => rows.get(userId),
      deleteOwnedLogo: async (userId: string, url: string) => {
        if (!ownedPublicUploadStorageKey(userId, url)) return false;
        deleted.push({ userId, url });
        return true;
      },
    },
  };
}

test("88 KB JPEG uploads through media storage and PATCH JSON stays under the Express JSON limit", async () => {
  const jpeg88 = jpegOfSize(88 * 1024);
  const inspected = inspectBusinessProfileLogoUpload({
    originalname: "brand.jpg",
    mimetype: "image/jpeg",
    size: jpeg88.length,
    buffer: jpeg88,
  });
  assert.equal(inspected.ok, true);

  const objectName = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";
  const stored = await storeWidgetLogoRaster({
    buffer: Buffer.from(jpeg88),
    mimeType: "image/jpeg",
    userId: "tenant-a",
    r2Enabled: true,
    upload: async (params) => {
      assert.equal(params.userId, "tenant-a");
      assert.equal(params.buffer.length, 88 * 1024);
      assert.equal(params.originChannel, "web-upload");
      return {
        mediaUrl: `https://cdn.example/media/tenant-a/web-upload/${objectName}`,
        mediaStorageKey: `media/tenant-a/web-upload/${objectName}`,
      };
    },
  });
  assert.equal(stored.logoUrl, `/objects/uploads/tenant-a__${objectName}`);
  assert.equal(isFirstPartyBusinessProfileLogoPath(stored.logoUrl), true);

  const dataUrl = `data:image/jpeg;base64,${"A".repeat(Math.ceil((88 * 1024 * 4) / 3))}`;
  assert.ok(
    businessProfilePatchJsonBytes({ companyLogo: dataUrl }) > BUSINESS_PROFILE_JSON_BODY_MAX_BYTES,
    "Base64 88 KB logo would exceed the JSON body limit",
  );

  const patch = buildBusinessProfileSaveBody({
    displayName: "Sam",
    businessName: "Acme HVAC",
    publicPhone: "",
    publicEmail: "",
    publicWebsite: "",
    aboutText: "About",
    companyLogo: stored.logoUrl,
  });
  const patchBytes = businessProfilePatchJsonBytes(patch);
  assert.ok(patchBytes < 4_000, `PATCH JSON was ${patchBytes} bytes`);
  assert.ok(patchBytes < BUSINESS_PROFILE_JSON_BODY_MAX_BYTES);
  assert.doesNotMatch(JSON.stringify(patch), /data:image/);
  assert.equal(patch.companyLogo, stored.logoUrl);

  const percents: number[] = [];
  const lock: BusinessProfileLogoUploadLock = { inFlight: false };
  const uploaded = await runBusinessProfileLogoUpload({
    file: fakeFile("brand.jpg", "image/jpeg", jpeg88),
    priorLogoUrl: "/objects/uploads/tenant-a__old.jpg",
    lock,
    onProgress: (p) => percents.push(p),
    uploadFn: async (_file, onProgress) => {
      onProgress?.(40);
      onProgress?.(90);
      return {
        ok: true,
        status: 200,
        json: async () => ({ logoUrl: stored.logoUrl }),
      };
    },
  });
  assert.equal(uploaded.ok, true);
  if (uploaded.ok) assert.equal(uploaded.logoUrl, stored.logoUrl);
  assert.ok(percents.includes(40));
  assert.equal(lock.inFlight, false);
});

test("invalid, spoofed, and oversized logos fail without changing the previous logo", async () => {
  const prior = "/objects/uploads/tenant-a__kept.jpg";
  assert.equal(validateBusinessProfileLogoFileMeta({ name: "logo.svg", type: "image/svg+xml", size: 12 }).ok, false);
  assert.equal(validateBusinessProfileLogoFileMeta({ name: "logo.exe", type: "application/x-msdownload", size: 12 }).ok, false);
  assert.equal(
    validateBusinessProfileLogoFileMeta({ name: "logo.jpg", type: "image/jpeg", size: BUSINESS_PROFILE_LOGO_MAX_BYTES + 1 }).ok,
    false,
  );

  const svg = inspectBusinessProfileLogoUpload({
    originalname: "logo.svg",
    mimetype: "image/svg+xml",
    size: SVG.length,
    buffer: SVG,
  });
  assert.equal(svg.ok, false);

  const spoofed = inspectBusinessProfileLogoUpload({
    originalname: "logo.png",
    mimetype: "image/png",
    size: SVG.length,
    buffer: SVG,
  });
  assert.equal(spoofed.ok, false);

  const exe = inspectBusinessProfileLogoUpload({
    originalname: "logo.jpg",
    mimetype: "image/jpeg",
    size: MZ.length,
    buffer: MZ,
  });
  assert.equal(exe.ok, false);

  const jpegNamedPng = inspectBusinessProfileLogoUpload({
    originalname: "logo.png",
    mimetype: "image/png",
    size: JPEG.length,
    buffer: JPEG,
  });
  assert.equal(jpegNamedPng.ok, false);

  const oversized = inspectBusinessProfileLogoUpload({
    originalname: "logo.jpg",
    mimetype: "image/jpeg",
    size: WEBCHAT_IMAGE_MAX_BYTES + 1,
    buffer: jpegOfSize(WEBCHAT_IMAGE_MAX_BYTES + 1),
  });
  assert.equal(oversized.ok, false);

  let current = prior;
  const failed = await runBusinessProfileLogoUpload({
    file: fakeFile("logo.jpg", "image/jpeg", JPEG),
    priorLogoUrl: prior,
    lock: { inFlight: false },
    uploadFn: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Upload failed" }),
    }),
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) current = prior;
  assert.equal(current, prior);
  assert.equal(companyLogoForPatch("data:image/png;base64,aaaa"), undefined);
  assert.equal(companyLogoForPatch(prior), prior);
});

test("tenant isolation: cannot persist or delete another workspace logo", async () => {
  const store = createTenantStore();
  const tenantA = "tenant-a";
  const tenantB = "tenant-b";
  const aLogo = "/objects/uploads/tenant-a__aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";
  const bLogo = "/objects/uploads/tenant-b__aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";

  await saveBusinessProfileForUser(tenantB, { businessName: "Victim", companyLogo: bLogo }, store.deps);
  const hijack = await saveBusinessProfileForUser(tenantA, { companyLogo: bLogo }, store.deps);
  assert.equal(hijack.ok, false);
  assert.equal(store.rows.get(tenantB)?.companyLogo, bLogo);
  assert.equal(store.rows.get(tenantA)?.companyLogo, undefined);

  assert.equal(persistBusinessProfileCompanyLogo(bLogo, tenantA), "invalid");
  assert.equal(persistBusinessProfileCompanyLogo(aLogo, tenantA), aLogo);
  assert.equal(ownedPublicUploadStorageKey(tenantA, bLogo), null);
  assert.equal(
    ownedPublicUploadStorageKey(tenantA, aLogo),
    "media/tenant-a/web-upload/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg",
  );

  const replaced = await saveBusinessProfileForUser(tenantA, { companyLogo: aLogo }, store.deps);
  assert.equal(replaced.ok, true);
  const next = "/objects/uploads/tenant-a__bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";
  const swap = await saveBusinessProfileForUser(tenantA, { companyLogo: next }, store.deps);
  assert.equal(swap.ok, true);
  assert.deepEqual(store.deleted, [{ userId: tenantA, url: aLogo }]);

  const removed = await saveBusinessProfileForUser(tenantA, { companyLogo: null }, store.deps);
  assert.equal(removed.ok, true);
  if (removed.ok) assert.equal(removed.profile.companyLogo, null);
  assert.equal(store.deleted.at(-1)?.url, next);
});

test("Business Profile logo stays off the Website Widget upload path", () => {
  const settings = read("client/src/components/settings/BusinessProfileSettings.tsx");
  assert.match(settings, /runBusinessProfileLogoUpload/);
  assert.match(settings, /xhrUploadBusinessProfileLogo/);
  assert.match(settings, /BUSINESS_PROFILE_LOGO_ACCEPT/);
  assert.match(settings, /data-testid="business-profile-logo-error"/);
  assert.match(settings, /data-testid="business-profile-logo-progress"/);
  assert.doesNotMatch(settings, /\/api\/widget-settings\/logo/);
  assert.doesNotMatch(settings, /readImageFile\(file, 2_000_000\);\s*dirtyRef/);
  assert.doesNotMatch(settings, /data:image/);

  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /runWidgetLogoUpload/);
  assert.match(website, /WIDGET_LOGO_ACCEPT/);
  assert.doesNotMatch(website, /\/api\/business-profile\/logo/);
  assert.doesNotMatch(website, /runBusinessProfileLogoUpload/);
  assert.equal(BUSINESS_PROFILE_LOGO_UPLOAD_PATH, "/api/business-profile/logo");

  const index = read("server/index.ts");
  assert.match(index, /const globalJsonParser = express\.json\(\);/);
  assert.doesNotMatch(index, /globalJsonParser = express\.json\(\{[^}]*limit/);

  const routes = read("server/routes.ts");
  assert.match(routes, /registerBusinessProfileLogoRoutes/);

  const patchSchema = businessProfilePatchSchema.safeParse({
    companyLogo: "https://cdn.example/logo.png",
  });
  assert.equal(patchSchema.success, false);
});
