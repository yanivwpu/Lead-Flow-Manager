import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const globals = globalThis as typeof globalThis & { contactDetailsFixture: any };
mkdirSync("work", { recursive: true });
await build({ entryPoints: ["client/src/pages/ContactDetails.tsx"], bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", outfile: "work/contact-details-render.mjs", plugins: [{ name: "crm-fixture", setup(build) {
  build.onResolve({ filter: /^react$/ }, () => ({ path: "react", external: true }));
  build.onResolve({ filter: /^(wouter|@tanstack\/react-query|@\/lib\/auth-context)$/ }, args => ({ path: args.path, namespace: "fixture" }));
  build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "wouter" ? `import React from 'react'; export const useRoute=()=>[true,{id:'contact'}]; export const useSearch=()=> 'returnTo=%2Fapp%2Fcontacts%3Fsearch%3DJane'; export const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);` : args.path.includes("auth-context") ? `export const useAuth=()=>({user:{id:'owner'}});` : `export const useQuery=({queryKey})=>{const f=globalThis.contactDetailsFixture; const p=queryKey[0];return {data:p.endsWith('/details')?f.details:p.endsWith('/notes')?f.notes:p.endsWith('/appointments')?[]:[],isPending:false,isError:false};};export const useQueryClient=()=>({invalidateQueries(){}}); export const useMutation=()=>({isPending:false,isError:false,mutate(){},reset(){}});` }));
} }] });
const { ContactDetails } = await import("../work/contact-details-render.mjs");
const contact = { id: "contact", name: "Jane Doe", email: "jane@example.com", phone: "15551234567", source: "whatsapp", primaryChannel: "whatsapp", tag: "Hot", pipelineStage: "Lead", createdAt: "2026-10-01", updatedAt: "2026-10-02" };
const render = (details: any) => { globals.contactDetailsFixture = { details, notes: [{ id: "n", content: "Review purchase", createdByName: "Team", createdAt: "2026-10-03" }] }; return renderToStaticMarkup(React.createElement(ContactDetails)); };

test("non-Shopify customer renders CRM profile, notes, existing conversation link and filtered return", () => {
  const html = render({ contact, conversations: [{ id: "thread", channel: "whatsapp" }], shopify: false, orders: [], activity: [] });
  assert.ok(html.includes("Jane Doe")); assert.ok(html.includes("Review purchase"));
  assert.ok(html.includes('/app/inbox/contact?conversation=thread'));
  assert.ok(html.includes('/app/contacts?search=Jane'));
  assert.ok(!html.includes("Shopify purchases"));
  assert.ok(html.includes('lg:grid-cols-')); assert.ok(html.includes('flex-wrap'));
});

test("Shopify customer renders persisted order information and handles absent messaging threads", () => {
  const html = render({ contact: { ...contact, source: "shopify", primaryChannel: "shopify" }, conversations: [{ id: "commerce", channel: "shopify" }], shopify: true, orders: [{ id: "o", number: "#1001", store: "store.myshopify.com", total: "42.00", currency: "USD", paymentStatus: "paid", createdAt: "2026-10-04", products: [{ name: "Shirt", quantity: 2 }] }], activity: [{ id: "e", eventType: "shopify_order_created", createdAt: "2026-10-04" }] });
  for (const text of ["Shopify purchases", "#1001", "Shirt", "42.00 USD", "paid", "No messaging conversation yet", "read-only"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("/app/inbox/"));
});
