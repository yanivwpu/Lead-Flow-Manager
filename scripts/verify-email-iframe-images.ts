/**
 * Real-browser fixture for isolated email iframe image rendering.
 * Simulates apex → app 307 survival, signed proxy refresh, CSP allowlist, and blocks.
 *
 * Run: npx tsx scripts/verify-email-iframe-images.ts
 * Then open the printed URL. Does not touch production data.
 */
import http from "node:http";
import { buildIsolatedEmailSrcDoc } from "../shared/emailHtmlIsolation";
import {
  buildEmailRemoteProxySrc,
  refreshEmailImageProxySrc,
  sanitizeEmailHtml,
} from "../server/emailChannel/htmlSanitize";
import {
  signEmailImageProxyRequest,
  verifyEmailImageProxyRequest,
} from "../server/emailChannel/emailImageProxySecret";
import { decodeEmailProxyUrlPayload, encodeEmailProxyUrlPayload } from "../shared/emailImagePolicy";

process.env.EMAIL_IMAGE_PROXY_SECRET =
  process.env.EMAIL_IMAGE_PROXY_SECRET || "test-email-image-proxy-secret-32b!!";

/** 1×1 PNG — naturalWidth === 1 when loaded. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const IFRAME_SANDBOX = [
  "allow-same-origin",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
].join(" ");

function listen(server: http.Server): Promise<{ port: number; origin: string }> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no address"));
        return;
      }
      resolve({ port: addr.port, origin: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function parseProxyRequest(reqUrl: string | undefined): {
  remote: string;
  expiresUnixSec: number;
  signature: string;
} | null {
  try {
    const u = new URL(String(reqUrl || ""), "http://127.0.0.1");
    if (u.pathname !== "/api/email/image-proxy" && u.pathname !== "/r/api/email/image-proxy") {
      return null;
    }
    const remote = decodeEmailProxyUrlPayload(u.searchParams.get("u") || "");
    if (!remote) return null;
    return {
      remote,
      expiresUnixSec: Number(u.searchParams.get("e")),
      signature: u.searchParams.get("s") || "",
    };
  } catch {
    return null;
  }
}

function serveProxy(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const parsed = parseProxyRequest(req.url);
  if (!parsed) return false;
  const ok = verifyEmailImageProxyRequest({
    remoteUrl: parsed.remote,
    expiresUnixSec: parsed.expiresUnixSec,
    signature: parsed.signature,
  });
  if (!ok) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("expired_or_invalid");
    return true;
  }
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(PNG_1X1);
  return true;
}

function escapeJsonScript(json: string): string {
  return json.replace(/</g, "\\u003c");
}

async function main(): Promise<void> {
  let appOrigin = "";
  let apexOrigin = "";

  const appServer = http.createServer((req, res) => {
    if (serveProxy(req, res)) return;
    res.writeHead(404);
    res.end("app-404");
  });

  const apexServer = http.createServer((req, res) => {
    const url = new URL(String(req.url || "/"), apexOrigin || "http://127.0.0.1");

    if (url.pathname === "/r/api/email/image-proxy") {
      res.writeHead(307, { Location: `${appOrigin}/api/email/image-proxy${url.search}` });
      res.end();
      return;
    }

    if (serveProxy(req, res)) return;

    if (url.pathname === "/expired") {
      const remote = "https://static.licdn.com/expired.png";
      const exp = Math.floor(Date.now() / 1000) - 60;
      const signature = signEmailImageProxyRequest(remote, exp);
      const stale = `/api/email/image-proxy?u=${encodeURIComponent(
        encodeEmailProxyUrlPayload(remote),
      )}&e=${exp}&s=${encodeURIComponent(signature)}`;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ stale, refreshed: refreshEmailImageProxySrc(stale) }));
      return;
    }

    if (url.pathname !== "/" && url.pathname !== "/verify") {
      res.writeHead(404);
      res.end("apex-404");
      return;
    }

    const linkedInRaw = `
      <p>Ada just messaged you on LinkedIn</p>
      <img data-role="linkedin-logo" alt="LinkedIn" src="https://static.licdn.com/sc/h/logo.png" width="84" height="21" />
      <img data-role="linkedin-photo" alt="Profile" src="https://media.licdn.com/dms/image/photo.png" width="40" height="40" />
    `;
    const turboRaw = `
      <table data-role="newsletter" background="https://braze-images.com/header.png" width="600">
        <tr>
          <td style="background-image:url('https://braze-images.com/bg.png')">
            <img data-role="newsletter-img" alt="TurboTax" src="https://braze-images.com/card.png" />
          </td>
        </tr>
      </table>
    `;
    const staleRemote = "https://static.licdn.com/stale-logo.png";
    const staleExp = Math.floor(Date.now() / 1000) - 120;
    const staleSig = signEmailImageProxyRequest(staleRemote, staleExp);
    const staleProxy = `/api/email/image-proxy?u=${encodeURIComponent(
      encodeEmailProxyUrlPayload(staleRemote),
    )}&e=${staleExp}&s=${encodeURIComponent(staleSig)}`;
    const storedStaleHtml = `<img data-role="stale-then-refresh" alt="Older signed" src="${staleProxy}" />`;

    const linkedInHtml = sanitizeEmailHtml(linkedInRaw, { purpose: "inbound", messageId: "li" }).html;
    const turboHtml = sanitizeEmailHtml(turboRaw, { purpose: "inbound", messageId: "tt" }).html;
    const refreshedHtml = sanitizeEmailHtml(storedStaleHtml, { purpose: "inbound", messageId: "old" }).html;

    const redirectSrc = buildEmailRemoteProxySrc("https://static.licdn.com/redirect.png").replace(
      "/api/email/image-proxy",
      "/r/api/email/image-proxy",
    );
    const redirectAbs = `${apexOrigin}${redirectSrc}`;
    const redirectHtml = `<img data-role="host-redirect" alt="Redirected proxy" src="${redirectAbs}" />`;

    const blockedRaw = `
      <img data-role="blocked-remote" alt="blocked" src="https://example.com/unauthorized.png" />
      <script>window.__emailPwned = true;</script>
      <img src="javascript:alert(1)" alt="js" />
    `;

    const origins = [apexOrigin, appOrigin];
    const payloads = {
      linkedInSrcDoc: buildIsolatedEmailSrcDoc(linkedInHtml, { imageOrigins: origins }),
      turboSrcDoc: buildIsolatedEmailSrcDoc(turboHtml, { imageOrigins: origins }),
      refreshedSrcDoc: buildIsolatedEmailSrcDoc(refreshedHtml, { imageOrigins: origins }),
      redirectSrcDoc: buildIsolatedEmailSrcDoc(redirectHtml, { imageOrigins: origins }),
      blockedSrcDoc: buildIsolatedEmailSrcDoc(blockedRaw, { imageOrigins: origins }),
      staleProxy,
      sandbox: IFRAME_SANDBOX,
    };

    const page = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Email iframe image verification</title>
</head>
<body>
  <h1>Email iframe image verification</h1>
  <p id="status">running</p>
  <pre id="results">pending</pre>
  <iframe id="frame-linkedin" title="linkedin" sandbox="${IFRAME_SANDBOX}" referrerpolicy="no-referrer"></iframe>
  <iframe id="frame-turbo" title="turbo" sandbox="${IFRAME_SANDBOX}" referrerpolicy="no-referrer"></iframe>
  <iframe id="frame-refresh" title="refresh" sandbox="${IFRAME_SANDBOX}" referrerpolicy="no-referrer"></iframe>
  <iframe id="frame-redirect" title="redirect" sandbox="${IFRAME_SANDBOX}" referrerpolicy="no-referrer"></iframe>
  <iframe id="frame-blocked" title="blocked" sandbox="${IFRAME_SANDBOX}" referrerpolicy="no-referrer"></iframe>
  <script type="application/json" id="payloads">${escapeJsonScript(JSON.stringify(payloads))}</script>
  <script>
    const payloads = JSON.parse(document.getElementById("payloads").textContent);
    function waitImages(doc) {
      const imgs = [...doc.querySelectorAll("img")];
      return Promise.all(imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
          setTimeout(resolve, 4000);
        });
      }));
    }
    function measure(frame, role) {
      const doc = frame.contentDocument;
      const el = doc && (role ? doc.querySelector('[data-role="' + role + '"]') : null);
      if (el && el.tagName === "IMG") {
        return { role: role, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, src: el.getAttribute("src") || "" };
      }
      if (el && el.getAttribute("background")) {
        return { role: role, background: el.getAttribute("background") || "" };
      }
      return { role: role, missing: true };
    }
    function loadFrame(id, srcDoc) {
      return new Promise((resolve) => {
        const frame = document.getElementById(id);
        frame.onload = () => resolve(frame);
        frame.srcdoc = srcDoc;
      });
    }
    async function probeBackground(url) {
      if (!url) return { ok: false, naturalWidth: 0 };
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ ok: img.naturalWidth > 0, naturalWidth: img.naturalWidth });
        img.onerror = () => resolve({ ok: false, naturalWidth: 0 });
        setTimeout(() => resolve({ ok: false, naturalWidth: img.naturalWidth || 0 }), 4000);
        img.src = url;
      });
    }
    (async () => {
      const [li, turbo, refresh, redirect, blocked] = await Promise.all([
        loadFrame("frame-linkedin", payloads.linkedInSrcDoc),
        loadFrame("frame-turbo", payloads.turboSrcDoc),
        loadFrame("frame-refresh", payloads.refreshedSrcDoc),
        loadFrame("frame-redirect", payloads.redirectSrcDoc),
        loadFrame("frame-blocked", payloads.blockedSrcDoc),
      ]);
      await Promise.all([
        waitImages(li.contentDocument),
        waitImages(turbo.contentDocument),
        waitImages(refresh.contentDocument),
        waitImages(redirect.contentDocument),
        waitImages(blocked.contentDocument),
      ]);
      const turboDoc = turbo.contentDocument;
      const table = turboDoc.querySelector('[data-role="newsletter"]');
      const td = turboDoc.querySelector("td");
      const bgAttr = table ? table.getAttribute("background") : "";
      const cssBg = td ? getComputedStyle(td).backgroundImage : "";
      const cssUrlMatch = cssBg && cssBg.match(/url\\(["']?([^"')]+)["']?\\)/);
      const cssUrl = cssUrlMatch ? cssUrlMatch[1] : "";
      const [bgProbe, cssProbe, staleFetch] = await Promise.all([
        probeBackground(bgAttr),
        probeBackground(cssUrl),
        fetch(payloads.staleProxy).then((r) => r.status).catch(() => 0),
      ]);
      const blockedDoc = blocked.contentDocument;
      const results = {
        sandbox: payloads.sandbox,
        allowScripts: /allow-scripts/.test(payloads.sandbox),
        linkedInLogo: measure(li, "linkedin-logo"),
        linkedInPhoto: measure(li, "linkedin-photo"),
        newsletterImg: measure(turbo, "newsletter-img"),
        newsletterBackgroundAttr: bgAttr,
        newsletterBackgroundLoaded: bgProbe,
        newsletterCssBackground: cssBg,
        newsletterCssLoaded: cssProbe,
        refreshed: measure(refresh, "stale-then-refresh"),
        staleProxyStatus: staleFetch,
        hostRedirect: measure(redirect, "host-redirect"),
        blockedRemote: measure(blocked, "blocked-remote"),
        srcdocHasScriptTag: /<script/i.test(payloads.blockedSrcDoc),
        iframePwnedFlag: !!(blocked.contentWindow && blocked.contentWindow.__emailPwned),
        csp: (blockedDoc.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || "",
      };
      const pass =
        results.linkedInLogo.naturalWidth > 0 &&
        results.linkedInPhoto.naturalWidth > 0 &&
        results.newsletterImg.naturalWidth > 0 &&
        results.newsletterBackgroundLoaded.ok &&
        results.newsletterCssLoaded.ok &&
        results.refreshed.naturalWidth > 0 &&
        results.staleProxyStatus === 403 &&
        results.hostRedirect.naturalWidth > 0 &&
        results.blockedRemote.naturalWidth === 0 &&
        results.srcdocHasScriptTag === false &&
        results.iframePwnedFlag === false &&
        results.allowScripts === false &&
        /https:\\/\\/app\\.whachatcrm\\.com/.test(results.csp) &&
        !/(^|[\\s;])https:([\\s;]|$)/.test((results.csp.match(/img-src[^;]+/) || [""])[0]);
      results.pass = pass;
      document.getElementById("results").textContent = JSON.stringify(results, null, 2);
      document.getElementById("status").textContent = pass ? "PASS" : "FAIL";
      document.title = pass ? "EMAIL_IFRAME_VERIFY_PASS" : "EMAIL_IFRAME_VERIFY_FAIL";
    })().catch((err) => {
      document.getElementById("status").textContent = "ERROR";
      document.getElementById("results").textContent = String(err && err.stack || err);
      document.title = "EMAIL_IFRAME_VERIFY_FAIL";
    });
  </script>
</body>
</html>`;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(page);
  });

  const appAddr = await listen(appServer);
  appOrigin = appAddr.origin;
  const apexAddr = await listen(apexServer);
  apexOrigin = apexAddr.origin;

  const url = `${apexOrigin}/verify`;
  console.log(JSON.stringify({ tag: "[EmailIframeVerify]", url, apexOrigin, appOrigin }));
  await new Promise(() => {
    /* keep servers alive */
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
