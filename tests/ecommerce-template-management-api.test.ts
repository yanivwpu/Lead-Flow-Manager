import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { SHOPIFY_GROWTH_TEMPLATES } from "../shared/shopifyGrowthTemplates";

test("Meta management API uses only the current merchant token/WABA, submits English examples, bounds pagination and sanitizes failures", async t => {
  await mkdir("work", { recursive: true }); const dir = await mkdtemp(resolve("work/template-api-"));
  const account = "fixture-account";
  const state = { user: { id: account, metaConnected: true, metaAccessToken: "fixture-secret", metaBusinessAccountId: "11111",
    metaTokenExpiresAt: null as Date | null } };
  (globalThis as any).__templateApi = state;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  let response = () => new Response(JSON.stringify({ data: [] }));
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: any, init?: RequestInit) => {
    requests.push({ url: String(url), init }); return response();
  });
  try {
    await build({ entryPoints: ["server/userMeta.ts"], outfile: join(dir, "api.mjs"), bundle: true,
      platform: "node", format: "esm", packages: "external", plugins: [{ name: "isolated-owner", setup(b) {
        b.onLoad({ filter: /[/\\]drizzle[/\\]db\.ts$/ }, () => ({ loader: "ts", contents: "export const db={};" }));
        b.onLoad({ filter: /[/\\]server[/\\]storage\.ts$/ }, () => ({ loader: "ts", contents:
          "export const storage={getUserForSession:async()=>globalThis.__templateApi.user};" }));
      } }] });
    const api = await import(pathToFileURL(join(dir, "api.mjs")).href);
    await assert.rejects(() => api.getMetaMessageTemplates(account, { expectedWabaId: "22221", maxPages: 5 }), /meta_connection_changed/);
    assert.equal(requests.length, 0);
    state.user.metaTokenExpiresAt = new Date(0);
    await assert.rejects(() => api.getMetaMessageTemplates(account, { expectedWabaId: "11111" }), /meta_credentials_expired/);
    assert.equal(requests.length, 0); state.user.metaTokenExpiresAt = null;
    response = () => new Response(JSON.stringify({ id: "56789", status: "PENDING" }));
    await api.createMetaShopifyMessageTemplate(account, "11111", SHOPIFY_GROWTH_TEMPLATES[0]);
    const request = requests.at(-1)!;
    assert.ok(request.url.endsWith("/11111/message_templates"));
    assert.ok(!request.url.includes("fixture-secret"));
    assert.equal((request.init?.headers as Record<string, string>).Authorization, "Bearer fixture-secret");
    const body = JSON.parse(String(request.init?.body));
    assert.deepEqual(body, { name: SHOPIFY_GROWTH_TEMPLATES[0].name, language: "en", category: "UTILITY",
      components: [{ type: "BODY", text: SHOPIFY_GROWTH_TEMPLATES[0].bodyText, example: { body_text: [["1234567890"]] } }] });
    assert.ok(!requests.some(r => /\/messages(?:\?|$)/.test(r.url)));
    requests.length = 0; let page = 0;
    response = () => new Response(JSON.stringify(page++ === 0 ? { data: [{ id: "1" }],
      paging: { next: "https://evil.invalid/steal", cursors: { after: "second-page" } } } : { data: [{ id: "2" }] }));
    assert.deepEqual(await api.getMetaMessageTemplates(account, { expectedWabaId: "11111", maxPages: 5 }), [{ id: "1" }, { id: "2" }]);
    assert.ok(requests.every(r => new URL(r.url).hostname === "graph.facebook.com"));
    assert.ok(requests[1].url.includes("after=second-page"));
    requests.length = 0; page = 0;
    response = () => new Response(JSON.stringify({ data: [], paging: { next: "ignored", cursors: { after: "page-" + page++ } } }));
    await assert.rejects(() => api.getMetaMessageTemplates(account, { expectedWabaId: "11111", maxPages: 5 }), /meta_template_inventory_incomplete/);
    assert.equal(requests.length, 5);
    response = () => new Response(JSON.stringify({ error: { code: 200, message: "private fixture-secret" } }), { status: 403 });
    await assert.rejects(() => api.getMetaMessageTemplates(account, { expectedWabaId: "11111" }), /^Error: meta_management_permission_required$/);
    response = () => new Response(JSON.stringify({ error: { code: 190, message: "private fixture-secret" } }), { status: 400 });
    await assert.rejects(() => api.createMetaShopifyMessageTemplate(account, "11111", SHOPIFY_GROWTH_TEMPLATES[0]), /^Error: meta_credentials_expired$/);
  } finally { fetchMock.mock.restore(); delete (globalThis as any).__templateApi; await rm(dir, { recursive: true, force: true }); }
});
