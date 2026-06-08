/**
 * Regression: switching Sales Portal accounts must not reuse stale session stats.
 *
 * Requires running server + DATABASE_URL (e.g. npx tsx tests/sales-portal-session-switch.test.ts).
 */
import "dotenv/config";

const BASE = process.env.APP_URL || "http://localhost:5000";

const DEMO = { email: "demo@sales.com", loginCode: "123456" };
const YANIV = { email: "yanivharamaty@gmail.com", loginCode: "956884" };

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

class SessionClient {
  private jar = new Map<string, string>();

  private storeCookies(res: Response) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const part = line.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) this.jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }

  private cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async req(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const c = this.cookieHeader();
    if (c) headers.set("cookie", c);
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
    this.storeCookies(res);
    const text = await res.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      /* plain */
    }
    return { status: res.status, json };
  }

  async login(email: string, loginCode: string) {
    return this.req("/api/sales-portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, loginCode }),
    });
  }

  async logout() {
    return this.req("/api/sales-portal/logout", { method: "POST" });
  }

  async check() {
    return this.req("/api/sales-portal/check");
  }

  async stats() {
    return this.req("/api/sales-portal/stats");
  }

  async demos() {
    return this.req("/api/sales-portal/demos");
  }
}

async function run() {
  const client = new SessionClient();

  const demoLogin = await client.login(DEMO.email, DEMO.loginCode);
  assert(demoLogin.status === 200, `demo login failed: ${JSON.stringify(demoLogin.json)}`);

  const demoStats = await client.stats();
  const demoDemos = await client.demos();
  const demoTotal = (demoStats.json as { totalBookings?: number })?.totalBookings ?? -1;
  const demoPending = Array.isArray(demoDemos.json) ? demoDemos.json.length : -1;
  assert(demoTotal === 0, `demo@sales.com expected totalBookings=0, got ${demoTotal}`);
  assert(demoPending === 0, `demo@sales.com expected 0 demos, got ${demoPending}`);

  const logoutRes = await client.logout();
  assert(logoutRes.status === 200, `logout failed: ${JSON.stringify(logoutRes.json)}`);

  const afterLogout = await client.check();
  assert(
    (afterLogout.json as { authenticated?: boolean })?.authenticated !== true,
    "session should be cleared after logout",
  );

  const yanivLogin = await client.login(YANIV.email, YANIV.loginCode);
  assert(yanivLogin.status === 200, `yaniv login failed: ${JSON.stringify(yanivLogin.json)}`);

  const yanivCheck = await client.check();
  const yanivEmail = (yanivCheck.json as { salesperson?: { email?: string } })?.salesperson?.email;
  assert(
    yanivEmail?.toLowerCase() === YANIV.email.toLowerCase(),
    `yaniv session email mismatch: ${yanivEmail}`,
  );

  const yanivStats = await client.stats();
  const yanivDemos = await client.demos();
  const yanivTotal = (yanivStats.json as { totalBookings?: number })?.totalBookings ?? -1;
  const yanivList = Array.isArray(yanivDemos.json) ? yanivDemos.json : [];
  const yanivPending = yanivList.filter((d: { status?: string }) => d.status === "pending").length;

  assert(yanivTotal === 1, `yaniv expected totalBookings=1, got ${yanivTotal}`);
  assert(yanivPending === 1, `yaniv expected 1 pending demo, got ${yanivPending}`);

  // Ensure demo session stats are not leaking into yaniv responses
  assert(yanivTotal !== demoTotal || yanivPending !== demoPending, "yaniv stats must differ from demo");

  console.log("sales-portal-session-switch.test.ts: all passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
