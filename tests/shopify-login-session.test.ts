import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import { Passport } from "passport";
import { establishShopifyLogin } from "../server/shopifyLoginSession";

test("Passport session survives the post-install redirect", async () => {
  const app = express();
  const passport = new Passport();
  const merchant = { id: "isolated-merchant" };
  passport.serializeUser((user, done) => done(null, (user as { id: string }).id));
  passport.deserializeUser((id: string, done) => done(null, id === merchant.id ? merchant : false));
  app.use(session({ secret: "isolated-login-test", resave: false, saveUninitialized: false }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.get("/callback", async (req, res, next) => {
    try { await establishShopifyLogin(req, merchant); res.redirect("/shopify/start"); }
    catch (error) { next(error); }
  });
  app.get("/shopify/start", (req, res) => res.status(req.user ? 200 : 401).json({ id: (req.user as { id: string } | undefined)?.id }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const callback = await fetch(origin + "/callback", { redirect: "manual" });
    assert.equal(callback.status, 302);
    const cookie = callback.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "login must establish a cookie before returning the redirect");
    const start = await fetch(origin + callback.headers.get("location"), { headers: { Cookie: cookie } });
    assert.equal(start.status, 200);
    assert.deepEqual(await start.json(), { id: merchant.id });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test("login and session-store failures reject before success", async () => {
  const order: string[] = [];
  const req = {
    login: (_user: unknown, done: (error?: Error) => void) => { order.push("login"); done(); },
    session: { save: (done: (error?: Error) => void) => { order.push("save"); done(); } },
  };
  await establishShopifyLogin(req as any, { id: "merchant" });
  assert.deepEqual(order, ["login", "save"]);
  req.session.save = done => done(new Error("isolated-store-failure"));
  await assert.rejects(establishShopifyLogin(req as any, { id: "merchant" }), /isolated-store-failure/);
  req.login = (_user, done) => done(new Error("isolated-login-failure"));
  await assert.rejects(establishShopifyLogin(req as any, { id: "merchant" }), /isolated-login-failure/);
});
