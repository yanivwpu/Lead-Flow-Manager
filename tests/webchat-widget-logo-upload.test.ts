/**
 * Website Chat widget logo upload: handler contract, response mapping, isolation.
 * Run: npx tsx tests/webchat-widget-logo-upload.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspectWebchatImageBuffer, WEBCHAT_IMAGE_MAX_BYTES } from "../shared/webchatImagePolicy";
import {
  coerceWidgetLogoUrl,
  mapUploadedMediaUrlToLogoPath,
  markWidgetLogoPreviewFailed,
  parseWidgetLogoUploadResponse,
  publicWidgetLogoErrorMessage,
  runWidgetLogoUpload,
  shouldResetWidgetLogoPreview,
  validateWidgetLogoFileMeta,
  widgetSettingsPatchLogoUrl,
  WIDGET_LOGO_ERROR_CODE,
  WIDGET_LOGO_UPLOAD_PATH,
  type WidgetLogoUploadLock,
} from "../shared/webchatWidgetLogoUpload";
import {
  buildWidgetLogoFilename,
  inspectWidgetLogoUpload,
  widgetLogoUploadAuth,
} from "../server/widgetLogoUpload";
import {
  isAllowedWidgetLogoStorageKey,
  isPublicUploadObjectFilename,
  storeWidgetLogoRaster,
  WIDGET_LOGO_ORIGIN_CHANNEL,
  widgetLogoReadKeys,
  widgetLogoStorageKey,
  WidgetLogoStorageUnavailableError,
} from "../server/mediaStorageService";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function fakeFile(name: string, type: string, bytes: Uint8Array) {
  return new File([bytes], name, { type });
}

function editorStateFromUnknown(saved: unknown): { logoUrl: string } {
  const rec = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const logoUrl = coerceWidgetLogoUrl(rec.logoUrl);
  logoUrl.trim();
  return { logoUrl };
}

{
  const event = {
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
  let submitted = false;
  let href = "https://app.example/app/widget";
  const lock: WidgetLogoUploadLock = { inFlight: false };
  let fetchCalls = 0;
  const result = await runWidgetLogoUpload({
    event,
    file: fakeFile("logo.jpg", "image/jpeg", JPEG),
    priorLogoUrl: "/objects/uploads/old-1.jpg",
    lock,
    fetchFn: async (url, init) => {
      fetchCalls += 1;
      assert.equal(url, WIDGET_LOGO_UPLOAD_PATH);
      assert.equal(init?.method, "POST");
      assert.equal(init?.credentials, "include");
      assert.ok(init?.body instanceof FormData);
      const sent = (init!.body as FormData).get("file") as File | Blob | null;
      assert.ok(sent);
      if (sent && "name" in sent) {
        assert.equal((sent as File).name, "logo.jpg");
      }
      assert.notEqual(href, "about:blank");
      return {
        ok: true,
        status: 200,
        json: async () => ({ logoUrl: "/objects/uploads/1710000000000-123456789.jpg" }),
      };
    },
  });
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(submitted, false);
  assert.equal(href, "https://app.example/app/widget");
  assert.equal(result.navigated, false);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.logoUrl, "/objects/uploads/1710000000000-123456789.jpg");
    assert.equal(typeof result.logoUrl, "string");
  }
  assert.equal(fetchCalls, 1);
}

{
  assert.equal(
    mapUploadedMediaUrlToLogoPath("https://whachatcrm.com/objects/uploads/171-99.png"),
    "/objects/uploads/171-99.png",
  );
  assert.equal(
    mapUploadedMediaUrlToLogoPath("https://cdn.example/uploads/171-99.webp"),
    "/objects/uploads/171-99.webp",
  );
  const parsed = parseWidgetLogoUploadResponse({
    mediaUrl: "https://app.example/objects/uploads/123-456.png",
    mediaType: "image",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.logoUrl, "/objects/uploads/123-456.png");
}

{
  const prior = "/objects/uploads/saved-logo.jpg";
  const r2 = parseWidgetLogoUploadResponse({
    mediaUrl: "https://pub.r2.dev/media/user-a/web-upload/uuid.jpg",
  });
  assert.equal(r2.ok, false);
  const malformed = parseWidgetLogoUploadResponse({});
  assert.equal(malformed.ok, false);
  const html = parseWidgetLogoUploadResponse("<html>nope</html>");
  assert.equal(html.ok, false);
  const nulled = parseWidgetLogoUploadResponse({ mediaUrl: null, logoUrl: null });
  assert.equal(nulled.ok, false);
  assert.equal(widgetSettingsPatchLogoUrl(new File([JPEG], "x.jpg", { type: "image/jpeg" }), prior), prior);
  assert.equal(widgetSettingsPatchLogoUrl({ currentTarget: {} }, prior), prior);
  assert.equal(widgetSettingsPatchLogoUrl("blob:https://evil/1", prior), prior);
  assert.equal(widgetSettingsPatchLogoUrl("data:image/png;base64,aaaa", prior), prior);
  const afterFail = editorStateFromUnknown({ logoUrl: prior });
  assert.equal(afterFail.logoUrl, prior);
}

{
  assert.equal(validateWidgetLogoFileMeta({ name: "logo.gif", type: "image/gif", size: 12 }).ok, false);
  assert.equal(validateWidgetLogoFileMeta({ name: "logo.svg", type: "image/svg+xml", size: 12 }).ok, false);
  assert.equal(
    validateWidgetLogoFileMeta({ name: "logo.jpg", type: "image/jpeg", size: WEBCHAT_IMAGE_MAX_BYTES + 1 }).ok,
    false,
  );
  const spoof = inspectWidgetLogoUpload({
    originalname: "logo.png",
    mimetype: "image/png",
    size: JPEG.length,
    buffer: JPEG,
  });
  assert.equal(spoof.ok, false);
  const svg = inspectWidgetLogoUpload({
    originalname: "logo.svg",
    mimetype: "image/svg+xml",
    size: SVG.length,
    buffer: SVG,
  });
  assert.equal(svg.ok, false);
  const svgNamedPng = inspectWidgetLogoUpload({
    originalname: "logo.png",
    mimetype: "image/png",
    size: SVG.length,
    buffer: SVG,
  });
  assert.equal(svgNamedPng.ok, false);
  const oversized = inspectWebchatImageBuffer(new Uint8Array(WEBCHAT_IMAGE_MAX_BYTES + 1), "image/jpeg");
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.reason, "too_large");
  const unsafe = mapUploadedMediaUrlToLogoPath("/objects/uploads/../secret.png");
  assert.equal(unsafe, "");
  assert.equal(mapUploadedMediaUrlToLogoPath("/objects/secret.png"), "");
  assert.equal(mapUploadedMediaUrlToLogoPath("/media/user-a/web-upload/x.jpg"), "");
  assert.equal(isPublicUploadObjectFilename("../x.jpg"), false);
  assert.equal(isPublicUploadObjectFilename("media/user-a/web-upload/x.jpg"), false);
  assert.equal(isPublicUploadObjectFilename("171-99.jpg"), true);
  const octet = inspectWidgetLogoUpload({
    originalname: "blob",
    mimetype: "application/octet-stream",
    size: JPEG.length,
    buffer: JPEG,
  });
  assert.equal(octet.ok, true);
  assert.equal(
    inspectWidgetLogoUpload({
      originalname: "logo.jpg",
      mimetype: "image/jpeg",
      size: JPEG.length,
      buffer: JPEG,
    }).ok,
    true,
  );
  assert.equal(
    inspectWidgetLogoUpload({
      originalname: "logo.png",
      mimetype: "image/png",
      size: PNG.length,
      buffer: PNG,
    }).ok,
    true,
  );
  assert.equal(
    inspectWidgetLogoUpload({
      originalname: "logo.webp",
      mimetype: "image/webp",
      size: WEBP.length,
      buffer: WEBP,
    }).ok,
    true,
  );
}

{
  const prior = "/objects/uploads/kept.jpg";
  const productionBody = parseWidgetLogoUploadResponse({ error: "Upload failed" }, 500);
  assert.equal(productionBody.ok, false);
  if (!productionBody.ok) {
    assert.equal(productionBody.error, publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE));
    assert.equal(productionBody.code, WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE);
  }
  const productionHandler = await runWidgetLogoUpload({
    file: fakeFile("logo.jpg", "image/jpeg", JPEG),
    priorLogoUrl: prior,
    lock: { inFlight: false },
    fetchFn: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Upload failed" }),
    }),
  });
  assert.equal(productionHandler.ok, false);
  if (!productionHandler.ok) {
    assert.equal(
      productionHandler.error,
      publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE),
    );
  }
  assert.equal(widgetSettingsPatchLogoUrl(undefined, prior), prior);

  const uploads: Array<{
    userId: string;
    originChannel?: string;
    objectBasename?: string;
    contentType: string;
    bufferIsBuffer: boolean;
    contentLength: number;
  }> = [];
  const objectName = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";
  const inboxKey = `media/tenant-a/web-upload/${objectName}`;
  const publicName = `tenant-a__${objectName}`;
  const stored = await storeWidgetLogoRaster({
    buffer: Buffer.from(JPEG),
    mimeType: "image/jpeg",
    userId: "tenant-a",
    r2Enabled: true,
    upload: async (params) => {
      uploads.push({
        userId: params.userId,
        originChannel: params.originChannel,
        objectBasename: params.objectBasename,
        contentType: params.contentType,
        bufferIsBuffer: Buffer.isBuffer(params.buffer),
        contentLength: params.buffer.length,
      });
      return {
        mediaUrl: `https://cdn.example/${inboxKey}`,
        mediaStorageKey: inboxKey,
      };
    },
  });
  assert.equal(stored.logoUrl, `/objects/uploads/${publicName}`);
  assert.equal(WIDGET_LOGO_ORIGIN_CHANNEL, "web-upload");
  assert.deepEqual(uploads, [
    {
      userId: "tenant-a",
      originChannel: "web-upload",
      objectBasename: undefined,
      contentType: "image/jpeg",
      bufferIsBuffer: true,
      contentLength: JPEG.length,
    },
  ]);
  assert.equal(widgetLogoStorageKey("tenant-a", objectName), inboxKey);
  assert.equal(isAllowedWidgetLogoStorageKey(inboxKey), true);
  assert.equal(isAllowedWidgetLogoStorageKey(`uploads/${objectName}`), false);
  assert.equal(isAllowedWidgetLogoStorageKey(`media/tenant-a/widget-logo/${objectName}`), false);
  assert.deepEqual(widgetLogoReadKeys(publicName), [inboxKey]);
  assert.equal(
    widgetLogoReadKeys(publicName).some((k) => k.includes("widget-logo") || k.includes("tenant-b") || k.startsWith("uploads/")),
    false,
  );
  const otherPublic = `tenant-b__${objectName}`;
  assert.deepEqual(widgetLogoReadKeys(otherPublic), [
    `media/tenant-b/web-upload/${objectName}`,
  ]);
  assert.equal(widgetLogoReadKeys(otherPublic).includes(inboxKey), false);

  let fallbackCalled = false;
  await assert.rejects(
    () =>
      storeWidgetLogoRaster({
        buffer: Buffer.from(JPEG),
        mimeType: "image/jpeg",
        userId: "tenant-a",
        r2Enabled: false,
        upload: async () => {
          fallbackCalled = true;
          return { mediaUrl: "https://cdn.example/nope.jpg", mediaStorageKey: inboxKey };
        },
      }),
    (err: unknown) => err instanceof WidgetLogoStorageUnavailableError,
  );
  assert.equal(fallbackCalled, false);

  const accessDenied = Object.assign(new Error("Access Denied"), {
    name: "InvalidRequest",
    Code: "XAmzContentSHA256Mismatch",
    $metadata: { httpStatusCode: 400 },
  });
  await assert.rejects(
    () =>
      storeWidgetLogoRaster({
        buffer: Buffer.from(JPEG),
        mimeType: "image/jpeg",
        userId: "tenant-a",
        r2Enabled: true,
        upload: async () => {
          throw accessDenied;
        },
      }),
    (err: unknown) =>
      err instanceof WidgetLogoStorageUnavailableError &&
      err.awsCode === "XAmzContentSHA256Mismatch" &&
      err.awsHttpStatus === 400,
  );

  await assert.rejects(
    () =>
      storeWidgetLogoRaster({
        buffer: Buffer.from(JPEG),
        mimeType: "image/jpeg",
        userId: "tenant-a",
        r2Enabled: true,
        upload: async () => ({
          mediaUrl: "https://cdn.example/media/tenant-b/web-upload/x.jpg",
          mediaStorageKey: "media/tenant-b/web-upload/x.jpg",
        }),
      }),
    (err: unknown) => err instanceof WidgetLogoStorageUnavailableError,
  );

  const persisted = widgetSettingsPatchLogoUrl(stored.logoUrl, "/objects/uploads/kept.jpg");
  assert.equal(persisted, `/objects/uploads/${publicName}`);
}

{
  const lock: WidgetLogoUploadLock = { inFlight: true };
  let fetchCalls = 0;
  const skipped = await runWidgetLogoUpload({
    file: fakeFile("logo.jpg", "image/jpeg", JPEG),
    priorLogoUrl: "/objects/uploads/old.jpg",
    lock,
    fetchFn: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, json: async () => ({ logoUrl: "/objects/uploads/new.jpg" }) };
    },
  });
  assert.equal(skipped.ok, false);
  if (!skipped.ok) assert.equal(skipped.skipped, true);
  assert.equal(fetchCalls, 0);
  assert.equal(lock.inFlight, true);
}

{
  assert.equal(markWidgetLogoPreviewFailed(false), true);
  assert.equal(markWidgetLogoPreviewFailed(true), true);
  let failed = false;
  failed = markWidgetLogoPreviewFailed(failed);
  failed = markWidgetLogoPreviewFailed(failed);
  assert.equal(failed, true);
  assert.equal(shouldResetWidgetLogoPreview("/objects/uploads/a.jpg", "/objects/uploads/a.jpg"), false);
  assert.equal(shouldResetWidgetLogoPreview("/objects/uploads/a.jpg", "/objects/uploads/b.jpg"), true);
}

{
  const auth = widgetLogoUploadAuth(null);
  assert.equal(auth.ok, false);
  if (!auth.ok) assert.equal(auth.status, 401);
  const ok = widgetLogoUploadAuth({ id: "tenant-a" });
  assert.equal(ok.ok, true);
  const name = buildWidgetLogoFilename("tenant-a", ".jpg");
  assert.match(name, /^tenant-a-\d+-\d+\.jpg$/);
  assert.equal(isPublicUploadObjectFilename(name), true);
}

{
  const prior = "/objects/uploads/kept.jpg";
  assert.doesNotThrow(() => editorStateFromUnknown({ logoUrl: null }));
  assert.equal(editorStateFromUnknown({ logoUrl: null }).logoUrl, "");
  assert.equal(editorStateFromUnknown({ logoUrl: undefined }).logoUrl, "");
  assert.equal(coerceWidgetLogoUrl(JPEG), "");
  const failedUpload = await runWidgetLogoUpload({
    file: fakeFile("logo.jpg", "image/jpeg", JPEG),
    priorLogoUrl: prior,
    lock: { inFlight: false },
    fetchFn: async () => ({ ok: false, status: 500, json: async () => ({ error: "nope" }) }),
  });
  assert.equal(failedUpload.ok, false);
  const kept = widgetSettingsPatchLogoUrl(
    failedUpload.ok ? failedUpload.logoUrl : undefined,
    prior,
  );
  assert.equal(kept, prior);
}

{
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /runWidgetLogoUpload/);
  assert.match(website, /WIDGET_LOGO_ACCEPT/);
  assert.match(website, /coerceWidgetLogoUrl\(settings\.logoUrl\)/);
  assert.match(website, /type="button"/);
  assert.match(website, /data-testid="button-logo-upload"/);
  const logoBlock = website.slice(
    website.indexOf('htmlFor="logo-url"'),
    website.indexOf("Chat icon"),
  );
  assert.match(logoBlock, /type="button"/);
  assert.doesNotMatch(logoBlock, /asChild/);
  assert.doesNotMatch(logoBlock, /\/api\/media\/upload/);
  assert.match(website, /e\.preventDefault\(\)/);
  assert.match(website, /e\.stopPropagation\(\)/);
  const sharedUpload = read("shared/webchatWidgetLogoUpload.ts");
  assert.match(sharedUpload, /\/api\/widget-settings\/logo/);
  const layout = read("client/src/pages/AppLayout.tsx");
  assert.match(layout, /AuthenticatedAppErrorBoundary/);
  assert.match(layout, /\/app\/website-widget/);
  const routes = read("server/routes.ts");
  assert.match(routes, /registerWidgetLogoRoutes/);
  const patchSlice = routes.slice(
    routes.indexOf('app.patch("/api/widget-settings"'),
    routes.indexOf("Phone Registration Endpoints"),
  );
  assert.match(patchSlice, /getWidgetPublicIdForUser/);
  assert.match(patchSlice, /registerWidgetLogoRoutes/);
  assert.doesNotMatch(patchSlice, /rotateWidgetPublicId/);
  const logoRoute = read("server/routes/widgetLogo.ts");
  assert.match(logoRoute, /widgetLogoUploadAuth/);
  assert.match(logoRoute, /storeWidgetLogoRaster/);
  assert.match(logoRoute, /logoUrl: stored\.logoUrl/);
  assert.match(logoRoute, /STORAGE_UNAVAILABLE/);
  assert.doesNotMatch(logoRoute, /buildWidgetLogoFilename/);
  assert.match(logoRoute, /awsCode/);
  const storage = read("server/mediaStorageService.ts");
  assert.match(storage, /requestChecksumCalculation/);
  assert.match(storage, /WHEN_REQUIRED/);
  assert.match(storage, /uploadOutboundUserMedia/);
  assert.match(storage, /originChannel: WIDGET_LOGO_ORIGIN_CHANNEL/);
  assert.match(storage, /WIDGET_LOGO_ORIGIN_CHANNEL = "web-upload"/);
  assert.doesNotMatch(storage, /objectBasename: filename/);
  assert.doesNotMatch(storage, /storedKey !== expectedKey/);
  assert.doesNotMatch(storage, /media\/\$\{owner\}\/widget-logo/);
  assert.doesNotMatch(storage, /primary: `uploads\/\$\{filename\}`/);
  const storeFn = storage.slice(
    storage.indexOf("export async function storeWidgetLogoRaster"),
    storage.indexOf("export async function readPublicUploadObject"),
  );
  assert.match(storeFn, /uploadOutboundUserMedia/);
  assert.match(storeFn, /inboxWebUploadObjectName/);
  assert.doesNotMatch(storeFn, /objectBasename:/);
  assert.doesNotMatch(storeFn, /objectBasename,/);
  assert.doesNotMatch(storeFn, /putFallbackObjectOrLocal/);
  assert.doesNotMatch(storeFn, /PRIVATE_OBJECT_DIR/);
  const readFn = storage.slice(
    storage.indexOf("export async function readPublicUploadObject"),
    storage.indexOf("export async function readOwnedStoredMedia"),
  );
  assert.match(readFn, /widgetLogoReadKeys/);
  assert.doesNotMatch(readFn, /readFallbackObject/);
  const objects = read("server/replit_integrations/object_storage/routes.ts");
  assert.match(objects, /readPublicUploadObject/);
  const inbox = read("server/routes/media.ts");
  assert.match(inbox, /originChannel: "web-upload"/);
  assert.match(inbox, /uploadOutboundUserMedia/);
  assert.doesNotMatch(inbox, /objectBasename/);
  const build = read("script/build.ts");
  assert.match(build, /process\.env\.NODE_ENV/);
  assert.doesNotMatch(build, /RAILWAY_GIT_COMMIT_SHA/);
  const routesSrc = read("server/routes.ts");
  const probeStart = routesSrc.indexOf('app.get("/api/debug/production-build-probe"');
  assert.ok(probeStart > 0);
  const probe = routesSrc.slice(probeStart, probeStart + 800);
  assert.match(probe, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(probe, /gitSha/);
  assert.ok(routesSrc.indexOf("registerMediaRoutes(app)") > probeStart);
  const header = read("client/src/components/webchat/WebchatPanelHeader.tsx");
  assert.match(header, /markWidgetLogoPreviewFailed/);
  assert.match(header, /webchat-panel-avatar/);
}

console.log("webchat-widget-logo-upload.test.ts: all assertions passed");
