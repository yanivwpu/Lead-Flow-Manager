/** Run: node --import tsx --test tests/email-message-loading.test.ts */
import assert from "node:assert/strict";
import test, { after, afterEach } from "node:test";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseHTML } from "linkedom";

mkdirSync("work", { recursive: true });
const scratch = mkdtempSync(resolve("work/email-message-loading-"));
await build({
  entryPoints: ["client/src/components/inbox/EmailMessageBody.tsx"],
  outfile: join(scratch, "EmailMessageBody.mjs"),
  bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic",
});
const { EmailMessageBody } = await import(pathToFileURL(join(scratch, "EmailMessageBody.mjs")).href);

const { window, document } = parseHTML("<html><body><main id='root'></main></body></html>");
const globals = ["window", "document", "fetch", "ResizeObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"];
const previousGlobals = globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, {
  getComputedStyle: () => ({ animationName: "none", display: "block" }),
  requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
  cancelAnimationFrame: clearTimeout,
});
const frameDocuments = new WeakMap<object, Document>();
const { document: blankDocument } = parseHTML("<html><body></body></html>");
Object.defineProperties(blankDocument, { URL: { value: "about:blank" }, readyState: { value: "complete" } });
// linkedom has no browsing contexts. Control documents/load events and dimensions explicitly.
Object.defineProperty(window.HTMLIFrameElement.prototype, "contentDocument", {
  configurable: true,
  get() { return frameDocuments.get(this) || blankDocument; },
});
const observers: Array<{ callback: () => void; disconnected: boolean }> = [];
Object.assign(globalThis, { ResizeObserver: class {
  record: (typeof observers)[number];
  constructor(callback: () => void) {
    this.record = { callback, disconnected: false };
    observers.push(this.record);
  }
  observe() {}
  disconnect() { this.record.disconnected = true; }
} });

type Detail = { htmlBody?: string | null; textBody?: string | null; subject?: string; fromAddress?: string; replyToAddress?: string };
type Request = { id: string; signal?: AbortSignal | null; resolve: (data: unknown) => void; reject: (error: Error) => void };
let requests: Request[] = [];
let root: Root | undefined;
let client: QueryClient;
const host = document.getElementById("root")!;
const find = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function render(messageId: string, fallbackText = `RAW ${messageId}`) {
  if (!root) {
    requests = [];
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    globalThis.fetch = ((_url: string, options?: RequestInit) => new Promise((resolve, reject) => {
      const id = _url.split("/")[3];
      requests.push({ id, signal: options?.signal, reject,
        resolve: (data) => resolve({ ok: true, json: async () => data } as Response) });
    })) as typeof fetch;
    root = createRoot(host as unknown as HTMLElement);
  }
  await act(async () => {
    root!.render(React.createElement(QueryClientProvider, { client },
      React.createElement(EmailMessageBody, { messageId, fallbackText, layout: "document" })));
  });
}

async function respond(id: string, detail: Detail, extra = {}) {
  const request = requests.findLast((request) => request.id === id)!;
  assert.ok(request, `request for ${id}`);
  await act(async () => { request.resolve({ detail, ...extra }); await tick(); await tick(); });
}

async function loadFrame(height = 320, url = "about:srcdoc", html = "<p>Measured email</p>") {
  const frame = find("email-html-body") as unknown as HTMLIFrameElement;
  assert.ok(frame, "HTML frame mounted");
  const { document: doc } = parseHTML(`<html><body>${html}</body></html>`);
  Object.defineProperties(doc, { URL: { value: url }, readyState: { value: "complete" } });
  Object.defineProperties(doc.documentElement, {
    scrollHeight: { configurable: true, value: height },
    offsetHeight: { configurable: true, value: height },
  });
  Object.defineProperty(doc.body, "scrollHeight", { configurable: true, value: height });
  frameDocuments.set(frame, doc as unknown as Document);
  await act(async () => { frame.dispatchEvent(new window.Event("load")); });
  return frame;
}

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  client?.clear();
  observers.length = 0;
});
after(() => {
  rmSync(scratch, { recursive: true, force: true });
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("HTML details never expose raw fallback before the loaded frame is measured", async () => {
  await render("html");
  assert.ok(!find("email-text-body"), "pending details must not paint the raw preview");
  assert.ok(find("email-body-loading"));
  await respond("html", { htmlBody: "<p>Formatted email</p>", subject: "Subject", fromAddress: "sender@example.com" });
  const frame = find("email-html-body") as unknown as HTMLIFrameElement;
  assert.equal(frame.style.visibility, "hidden");
  assert.ok(find("email-body-loading"), "same loading state covers iframe initialization");
  assert.ok(!find("email-text-body"));
  await loadFrame(320, "about:blank");
  assert.equal(frame.style.visibility, "hidden", "initial blank document is not the email");
  await loadFrame(320);
  assert.notEqual(frame.style.visibility, "hidden");
  assert.equal(frame.style.height, "328px");
  assert.ok(!find("email-body-loading"));
  assert.match(find("email-document-meta")!.textContent!, /Subject/);
});

test("resize measurements follow content growth/shrink without counting the iframe viewport", async () => {
  await render("resize");
  await respond("resize", { htmlBody: "<p>Variable height</p>" });
  const frame = await loadFrame(320);
  let contentHeight = 320;
  const doc = frame.contentDocument!;
  Object.defineProperty(frame, "clientHeight", { get: () => Number.parseInt(frame.style.height) });
  // The browser's root scrollHeight is at least the iframe viewport height.
  Object.defineProperties(doc.documentElement, {
    scrollHeight: { configurable: true, get: () => Math.max(contentHeight, frame.clientHeight) },
    offsetHeight: { configurable: true, get: () => contentHeight },
  });
  Object.defineProperty(doc.body, "scrollHeight", { configurable: true, get: () => contentHeight });
  for (const next of [320, 320, 600, 600, 100]) {
    contentHeight = next;
    await act(async () => { observers.at(-1)!.callback(); });
    assert.equal(frame.style.height, `${next + 8}px`);
  }
  // Emails with html/body height:100% also report viewport-sized offset/scroll heights.
  Object.defineProperty(doc.documentElement, "offsetHeight", { get: () => frame.clientHeight });
  Object.defineProperty(doc.body, "scrollHeight", { get: () => frame.clientHeight });
  await act(async () => { observers.at(-1)!.callback(); });
  assert.equal(frame.style.height, "108px", "viewport-sized content does not add another 8px");
});

test("rapid A → B → C switching ignores late responses and never paints any raw preview", async () => {
  for (const id of ["a", "b", "c"]) {
    await render(id);
    assert.ok(!find("email-text-body"));
    assert.ok(find("email-body-loading"));
  }
  await respond("b", { htmlBody: "<p>STALE B</p>" });
  await respond("a", { htmlBody: "<p>STALE A</p>" });
  assert.ok(!find("email-html-body"), "old responses cannot replace C's loading state");
  await respond("c", { htmlBody: "<p>CURRENT C</p>" });
  assert.match(find("email-html-body")!.getAttribute("srcDoc")!, /CURRENT C/);
  assert.ok(!find("email-text-body"));
  assert.ok(requests.filter(({ id }) => id !== "c").every(({ signal }) => signal?.aborted),
    "obsolete detail requests are cancelled");
});

test("switching loaded messages resets frame identity and rejects old load/resize callbacks", async () => {
  await render("a");
  await respond("a", { htmlBody: "<p>Same HTML</p>" });
  const oldFrame = await loadFrame(600);
  const oldObserver = observers.at(-1)!;
  // Another observer (e.g. attachments) can keep B's details available on selection.
  client.setQueryData(["/api/messages", "b", "email-details"], { detail: { htmlBody: "<p>Same HTML</p>" } });
  await render("b");
  const newFrame = find("email-html-body") as unknown as HTMLIFrameElement;
  assert.ok(newFrame !== oldFrame, "even identical HTML belongs to a fresh message frame");
  await act(async () => { oldFrame.dispatchEvent(new window.Event("load")); oldObserver.callback(); });
  assert.equal(newFrame.style.visibility, "hidden");
  assert.ok(oldObserver.disconnected);
  assert.ok(find("email-body-loading"));
  await respond("b", { htmlBody: "<p>Same HTML</p>" });
  await loadFrame(180);
  assert.equal(newFrame.style.height, "188px");
});

test("plain-text, empty-HTML, failed details and optimistic messages keep readable escaped text", async () => {
  for (const [id, text] of [["en", "Hello\n<not-markup>"], ["he", "שלום\nתודה"], ["es", "¡Hola!\nGracias, señor"]]) {
    await render(id);
    await respond(id, { htmlBody: "  ", textBody: text });
    assert.equal(find("email-text-body")!.textContent, text);
    assert.ok(!host.querySelector("not-markup"), "plain text remains escaped");
    assert.ok(!find("email-html-body"));
    assert.ok(!find("email-body-loading"));
  }
  await render("empty", "Fallback body");
  await respond("empty", { htmlBody: null, textBody: null });
  assert.equal(find("email-text-body")!.textContent, "Fallback body");
  await render("failed", "Offline fallback");
  await act(async () => { requests.at(-1)!.reject(new Error("offline")); await tick(); await tick(); });
  assert.equal(find("email-text-body")!.textContent, "Offline fallback");
  const count = requests.length;
  await render("optimistic-send", "Sending plain text");
  assert.equal(find("email-text-body")!.textContent, "Sending plain text");
  assert.equal(requests.length, count);
});

test("website-form classification still renders the dedicated card after details arrive", async () => {
  await render("form");
  await respond("form", { htmlBody: "<p>Raw notification</p>" }, {
    formMeta: { sourceType: "website_form", visitorEmail: "visitor@example.com", visitorMessage: "Hola, שלום" },
  });
  assert.ok(find("website-form-message-card"));
  assert.equal(find("form-visitor-message")!.textContent, "Hola, שלום");
  assert.ok(!find("email-html-body"));
});

test("image failure refresh stays HTML, resets frame readiness, and retries once per message", async (t) => {
  await render("a");
  await respond("a", { htmlBody: '<img src="/api/email/image-proxy?old" />' });
  const failedImage = '<img src="/api/email/image-proxy?old" />';
  const descriptors = Object.getOwnPropertyDescriptors(window.HTMLImageElement.prototype);
  t.after(() => {
    for (const key of ["complete", "naturalWidth"]) {
      if (descriptors[key]) Object.defineProperty(window.HTMLImageElement.prototype, key, descriptors[key]);
      else Reflect.deleteProperty(window.HTMLImageElement.prototype, key);
    }
  });
  // A completed image with zero natural width failed before the iframe load event.
  Object.defineProperties(window.HTMLImageElement.prototype, {
    complete: { configurable: true, get: () => true },
    naturalWidth: { configurable: true, get: () => 0 },
  });
  const oldFrame = await loadFrame(200, "about:srcdoc", failedImage);
  assert.equal(requests.filter(({ id }) => id === "a").length, 2);
  assert.ok(!find("email-text-body"), "background refresh never exposes raw fallback");
  await respond("a", { htmlBody: '<img src="/api/email/image-proxy?fresh" />' });
  const newFrame = find("email-html-body") as unknown as HTMLIFrameElement;
  assert.ok(newFrame !== oldFrame);
  assert.equal(newFrame.style.visibility, "hidden");
  await loadFrame(200, "about:srcdoc", failedImage);
  assert.equal(requests.filter(({ id }) => id === "a").length, 2, "no retry loop");
  await render("b");
  await respond("b", { htmlBody: failedImage });
  await loadFrame(200, "about:srcdoc", failedImage);
  assert.equal(requests.filter(({ id }) => id === "b").length, 2, "new message has its own retry");
});

test("lazy image errors still refresh without ResizeObserver; old image listeners are removed", async (t) => {
  const resizeObserver = globalThis.ResizeObserver;
  const complete = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, "complete");
  t.after(() => {
    globalThis.ResizeObserver = resizeObserver;
    if (complete) Object.defineProperty(window.HTMLImageElement.prototype, "complete", complete);
    else Reflect.deleteProperty(window.HTMLImageElement.prototype, "complete");
  });
  Reflect.deleteProperty(globalThis, "ResizeObserver");
  Object.defineProperty(window.HTMLImageElement.prototype, "complete", { configurable: true, get: () => false });
  await render("lazy");
  await respond("lazy", { htmlBody: '<img loading="lazy" src="/api/email/image-proxy?lazy" />' });
  const frame = await loadFrame(200, "about:srcdoc", '<img loading="lazy" />');
  const image = frame.contentDocument!.querySelector("img")!;
  assert.equal(frame.style.visibility, "visible");
  await act(async () => { image.dispatchEvent(new window.Event("error")); });
  assert.equal(requests.filter(({ id }) => id === "lazy").length, 2);
  await render("next");
  const count = requests.length;
  await act(async () => {
    image.dispatchEvent(new window.Event("load"));
    image.dispatchEvent(new window.Event("error"));
  });
  assert.equal(requests.length, count);
  assert.ok(find("email-body-loading"));
});
