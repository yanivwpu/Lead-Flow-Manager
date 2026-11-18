import test from "node:test";
import assert from "node:assert/strict";
import { inboxSessionDatabaseUrl } from "../server/inboxSessionDatabase";

test("Neon coordination bypasses transaction pooling on the same branch/database", () => {
  const source =
    "postgresql://fixture:p%40ss@ep-fixture-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  const before = new URL(source),
    after = new URL(inboxSessionDatabaseUrl({ DATABASE_URL: source }));
  assert.equal(after.hostname, "ep-fixture.c-6.us-east-1.aws.neon.tech");
  for (const field of [
    "username",
    "password",
    "pathname",
    "search",
    "port",
    "protocol",
  ] as const)
    assert.equal(after[field], before[field]);
  assert.equal(
    before.hostname,
    "ep-fixture-pooler.c-6.us-east-1.aws.neon.tech",
  );
});
test("direct URLs/local isolated schemas stay intact and explicit unpooled URL wins", () => {
  const direct =
    "postgresql://fixture:fixture@127.0.0.1:55439/codex_inbox?options=-c+search_path%3Dfixture%2Cpublic";
  assert.equal(inboxSessionDatabaseUrl({ DATABASE_URL: direct }), direct);
  assert.equal(
    inboxSessionDatabaseUrl({
      DATABASE_URL: "postgresql://unused/unused",
      DATABASE_URL_UNPOOLED: direct,
    }),
    direct,
  );
  assert.equal(
    new URL(
      inboxSessionDatabaseUrl({
        DATABASE_URL: "postgresql://fixture@unrelated-pooler.example.com/test",
      }),
    ).hostname,
    "unrelated-pooler.example.com",
  );
  assert.throws(() => inboxSessionDatabaseUrl({}), /requires DATABASE_URL/);
});
