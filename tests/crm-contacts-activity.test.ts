import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { getCrmContactsActivityPage, parseCrmActivityCursor } from "../server/crmContactsActivity";
import { contacts } from "../shared/schema";
import { contactMatchesCrmSearch } from "../shared/webchatContactIdentity";
import en from "../client/src/locales/en.json";

test("Contacts seeks across workspace pages by incoming activity, preserves history and keeps CRM visibility", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const db = drizzle(database);
  const columns = getTableConfig(contacts).columns.map(column => `"${column.name}" ${column.getSQLType()}`);
  await database.exec(`CREATE TABLE contacts (${columns.join(", ")})`);
  const monthsAgo = new Date("2026-03-01T12:00:00Z");
  const yesterday = new Date("2026-11-21T12:00:00Z");
  const today = new Date("2026-11-22T12:00:00Z");
  await db.insert(contacts).values([
    { id: "returning", userId: "owner", source: "manual", name: "Returning Contact", createdAt: monthsAgo, lastIncomingAt: today },
    { id: "new", userId: "owner", source: "manual", name: "New Lead", createdAt: yesterday, email: "new@example.com", phone: "9541234567" },
    { id: "edited", userId: "owner", source: "manual", name: "Edited Contact", createdAt: monthsAgo, updatedAt: today },
    { id: "legacy-null", userId: "owner", source: "manual", name: "Legacy", createdAt: null },
    { id: "foreign", userId: "other", source: "manual", name: "Other workspace", createdAt: today },
    { id: "email-inbox", userId: "owner", name: "Inbox only", source: "email_inbox", createdAt: today },
    { id: "anonymous", userId: "owner", name: "Website Visitor", source: "webchat", createdAt: today },
  ]);
  await db.execute(sql`
    insert into contacts (id, user_id, name, source, created_at, last_incoming_at)
    select 'tie-' || lpad(n::text, 4, '0'), 'owner', 'Dormant Contact', 'manual',
           timestamp '2026-05-01', timestamp '2026-05-01 13:00:00.456123'
    from generate_series(1, 1100) as n`);
  await db.execute(sql`
    insert into contacts (id, user_id, name, source, created_at, last_incoming_at)
    values ('precise', 'owner', 'Microsecond Boundary', 'manual', timestamp '2026-05-01',
            timestamp '2026-05-01 13:00:00.456122')`);

  const first = await getCrmContactsActivityPage(db, "owner");
  assert.ok(first.nextCursor);
  const next = parseCrmActivityCursor(first.nextCursor.at, first.nextCursor.id);
  assert.ok(next);
  assert.match(next.at, /\.456123$/);
  const second = await getCrmContactsActivityPage(db, "owner", next);
  assert.ok(second.nextCursor);
  const third = await getCrmContactsActivityPage(db, "owner", second.nextCursor);
  assert.equal(third.nextCursor, null);
  const rows = [...first.contacts, ...second.contacts, ...third.contacts];
  assert.equal(rows.length, 1105);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.deepEqual(rows.slice(0, 3).map(row => row.id), ["returning", "new", "tie-1100"]);
  assert.deepEqual(rows.slice(-4).map(row => row.id), ["tie-0001", "precise", "edited", "legacy-null"]);
  assert.equal(rows[0].createdAt?.toISOString(), monthsAgo.toISOString());
  for (const term of ["New Lead", "new@example.com", "9541234567"]) {
    assert.deepEqual(rows.filter(row => contactMatchesCrmSearch(row, term)).map(row => row.id), ["new"]);
  }
  const foreign = await getCrmContactsActivityPage(db, "other", next);
  assert.equal(foreign.contacts.length, 0);
});

test("Contacts page cursor requires a complete, valid pair", () => {
  for (const date of ["2026-02-30T12:00:00.123456", "2026-04-12T24:00:00.123456", "invalid", ["2026-11-20"]]) {
    assert.equal(parseCrmActivityCursor(date, "id"), null);
  }
  assert.equal(parseCrmActivityCursor("2026-11-20T00:00:00.100000", undefined), null);
  assert.equal(parseCrmActivityCursor("2026-11-20T00:00:00.100000", " "), null);
});

test("Contacts keeps URL-selected filters and alternate sorting while defaulting to activity", async (t) => {
  const { build } = await import("esbuild");
  const { mkdirSync, mkdtempSync, rmSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { parseHTML } = await import("linkedom");
  const { createInstance } = await import("i18next");
  const { I18nextProvider } = await import("react-i18next");
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  mkdirSync("work", { recursive: true });
  const scratch = mkdtempSync(resolve("work/crm-activity-render-"));
  const outfile = join(scratch, "page.mjs");
  t.after(() => rmSync(scratch, { recursive: true, force: true }));

  const fixture = (id: string, name: string, createdAt: string, more: object = {}) => ({
    id, name, createdAt, tag: "New", pipelineStage: "Lead", source: "manual", primaryChannel: "whatsapp", ...more,
  });
  const state = {
    search: "",
    contacts: [
      fixture("returning", "Zoe Returning", "2026-03-01", { lastIncomingAt: "2026-11-22T11:00:00Z" }),
      fixture("new", "Amy New Lead", "2026-11-21", { email: "amy@example.com", phone: "9541234567", tag: "Warm", primaryChannel: "webchat", customFields: { webchatIdentity: { status: "identified" } } }),
      fixture("dormant", "Bob Dormant", "2026-04-01"),
    ],
  };
  const globals = globalThis as typeof globalThis & { crmActivityFixture?: typeof state };
  globals.crmActivityFixture = state;
  t.after(() => { delete globals.crmActivityFixture; });
  const mocks: Record<string, string> = {
    wouter: `export const useSearch = () => globalThis.crmActivityFixture.search;
      export const useLocation = () => ['/app/contacts', () => {}];`,
    "@tanstack/react-query": `export const useQuery = ({queryKey}) => ({ data: queryKey[0] === '/api/contacts' ?
      globalThis.crmActivityFixture.contacts : undefined }); export const useMutation = () => ({});
      export const useQueryClient = () => ({});`,
    "@/lib/auth-context": `export const useAuth = () => ({ user: { id: 'owner' } });`,
    "@/hooks/use-toast": `export const useToast = () => ({ toast: () => {} });`,
  };
  await build({ entryPoints: ["client/src/pages/Contacts.tsx"], outfile, bundle: true, platform: "node",
    format: "esm", packages: "external", jsx: "automatic", plugins: [{ name: "contacts-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "contacts-fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "contacts-fixture" }, ({ path }) => ({ contents: mocks[path], loader: "js" }));
    } }] });
  const { Contacts } = await import(pathToFileURL(outfile).href);
  const render = (search = "") => {
    state.search = search;
    const page = React.createElement(I18nextProvider, { i18n }, React.createElement(Contacts));
    return parseHTML(renderToStaticMarkup(page)).document;
  };
  const order = (document: ReturnType<typeof render>) => [...new Set(
    [...document.querySelectorAll('[data-testid^="row-contact-"]')].map(row => row.getAttribute("data-testid")?.replace("row-contact-", "")),
  )];
  const initial = render();
  assert.deepEqual(order(initial), ["returning", "new", "dormant"]);
  assert.ok(initial.querySelector('[aria-label="Recent Activity (descending)"]'));
  const activity = initial.querySelector('[data-testid="row-contact-returning"] time');
  assert.ok(activity?.getAttribute("title"));
  assert.equal(activity.getAttribute("datetime") ?? activity.getAttribute("dateTime"), "2026-11-22T11:00:00Z");
  assert.deepEqual(order(render("sort=name&direction=asc")), ["new", "dormant", "returning"]);
  assert.deepEqual(order(render("sort=createdAt&direction=desc")), ["new", "dormant", "returning"]);
  assert.deepEqual(order(render("sort=activity&direction=asc")), ["dormant", "new", "returning"]);
  assert.deepEqual(order(render("direction=asc")), ["returning", "dormant", "new"]);
  assert.deepEqual(order(render("tag=Warm&channel=webchat&stage=Lead&search=amy%40example.com")), ["new"]);
  assert.deepEqual(order(render("search=stale%20search")), []);
});
