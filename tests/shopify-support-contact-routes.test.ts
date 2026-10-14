import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import { createShopifySupportContactRouter } from "../server/shopifySupportContactRoutes";
import type { ShopifySupportContactAction } from "../shared/shopifyContactPrivacy";
const fixtureEmail = ["contact", "example.invalid"].join("@");

test("contact endpoint is session-scoped, private, CSRF protected and does not intercept OAuth/webhooks", async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "fixture-session-only", resave: false, saveUninitialized: false }));
  app.post("/fixture/login", (req, res) => { (req.session as any).fixture = "merchant"; res.sendStatus(204); });
  app.use((req, _res, next) => { if ((req.session as any).fixture) (req as any).user = { id: "merchant" }; next(); });
  let writes = 0; let active = true; let lastAction: ShopifySupportContactAction | undefined;
  app.use("/api/shopify", createShopifySupportContactRouter({
    read: async id => { assert.equal(id, "merchant"); return { available: active, suggestedEmail: active ? fixtureEmail : null, confirmed: false, dismissed: false }; },
    save: async (id, action) => { assert.equal(id, "merchant"); if (!active) return false; writes++; lastAction = action; return true; },
  }));
  app.get("/api/shopify/callback", (_req, res) => res.sendStatus(204));
  app.post("/api/shopify/webhooks/shop/redact", (_req, res) => res.sendStatus(204));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const origin = "http://127.0.0.1:" + address.port;
  const path = origin + "/api/shopify/support-contact";
  try {
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(origin + "/api/shopify/callback")).status, 204);
    assert.equal((await fetch(origin + "/api/shopify/webhooks/shop/redact", { method: "POST" })).status, 204);
    const login = await fetch(origin + "/fixture/login", { method: "POST" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(path, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get("cache-control"), "no-store");
    const read = await response.json();
    assert.ok(read.suggestedEmail === fixtureEmail);
    assert.equal((await fetch(path, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", email: fixtureEmail }) })).status, 403);
    const headers = { Cookie: cookie, Origin: origin, "Content-Type": "application/json" };
    assert.equal((await fetch(path, { method: "POST", headers, body: JSON.stringify({ action: "confirm", email: "invalid" }) })).status, 400);
    assert.equal(writes, 0);
    assert.equal((await fetch(path, { method: "POST", headers,
      body: JSON.stringify({ action: "confirm", email: fixtureEmail, userId: "other", shop: "other.myshopify.com", marketingConsent: true }) })).status, 200);
    assert.equal(writes, 1);
    assert.ok(lastAction?.action === "confirm" && !("userId" in lastAction) && !("marketingConsent" in lastAction));
    active = false;
    const unavailable = await (await fetch(path, { headers: { Cookie: cookie } })).json();
    assert.ok(unavailable.available === false && unavailable.suggestedEmail === null);
    assert.equal((await fetch(path, { method: "POST", headers, body: JSON.stringify({ action: "dismiss" }) })).status, 409);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test("support contact accepts direct first-party requests behind TLS proxy and rejects tainted/foreign origins before writes", async () => {
  const app = express(); app.set("trust proxy",1); app.use(express.json());
  app.use((req,_res,next) => { if(req.get("x-fixture-session") === "valid") (req as any).user={id:"merchant"}; next(); });
  let writes=0, failed=false, inactive=false;
  let saved = {available:true,suggestedEmail:null as string|null,confirmed:false,dismissed:false};
  app.use('/api/shopify',createShopifySupportContactRouter({
    read:async id=>{assert.equal(id,'merchant');return saved;},
    save:async(id,action)=>{
      assert.equal(id,'merchant'); if(failed)throw Error('database unavailable'); if(inactive)return false;
      writes++; saved={...saved,...(action.action==='dismiss'?{dismissed:true}:action.action==='confirm'?{confirmed:true,dismissed:false,suggestedEmail:action.email}:{})}; return true;
    },
  }));
  const server=app.listen(0); await new Promise<void>(resolve=>server.once('listening',resolve));
  const path=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/shopify/support-contact`;
  const post=(origin:string,extra:Record<string,string>={},body:unknown={action:'dismiss'})=>fetch(path,{method:'POST',
    headers:{Host:'app.whachatcrm.com','x-forwarded-proto':'https','x-fixture-session':'valid',Origin:origin,'Content-Type':'application/json','sec-fetch-site':'same-site',...extra},body:JSON.stringify(body)});
  try {
    for(const origin of ['https://www.whachatcrm.com','https://whachatcrm.com','https://app.whachatcrm.com'])
      assert.equal((await post(origin)).status,200);
    assert.equal(writes,3); assert.equal(saved.dismissed,true); assert.equal(saved.suggestedEmail,null);
    const refresh=await fetch(path,{headers:{'x-fixture-session':'valid'}}); assert.equal((await refresh.json()).dismissed,true);
    for(const origin of ['null','','https://evil.example.invalid','https://app.whachatcrm.com.evil.example.invalid','http://www.whachatcrm.com','https://www.whachatcrm.com/path'])
      assert.equal((await post(origin)).status,403);
    assert.equal((await post('https://www.whachatcrm.com',{'sec-fetch-site':'cross-site'})).status,403);
    assert.equal((await post('https://www.whachatcrm.com',{'Content-Type':'text/plain'})).status,403);
    assert.equal(writes,3);
    assert.equal((await post('https://www.whachatcrm.com',{'x-fixture-session':'expired'})).status,401);
    assert.equal((await post('https://www.whachatcrm.com',{}, {action:'confirm',email:fixtureEmail,userId:'other'})).status,200);
    assert.equal(saved.confirmed,true); assert.equal(saved.suggestedEmail,fixtureEmail);
    assert.equal((await post('https://www.whachatcrm.com',{}, {action:'confirm',email:''})).status,400);
    failed=true; assert.equal((await post('https://www.whachatcrm.com')).status,503);
    failed=false; inactive=true; assert.equal((await post('https://www.whachatcrm.com')).status,409);
    assert.equal(writes,4);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
