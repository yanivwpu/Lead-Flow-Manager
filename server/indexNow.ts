import fs from "fs";
import path from "path";
import { BLOG_POSTS_META, PAGE_META } from "./seo";

// ─── Constants ────────────────────────────────────────────────────────────────

const INDEXNOW_KEY = "9726ec610d574c62b33130ba828766eb";
const HOST = "whachatcrm.com";
const BASE_URL = `https://${HOST}`;
const KEY_LOCATION = `${BASE_URL}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_API = "https://api.indexnow.org/indexnow";

// Path to the lightweight JSON file that tracks what has been submitted.
// In production (autoscale) the filesystem is ephemeral, so this file will not
// exist after a fresh deploy — that is intentional: every deploy is treated as
// a first-run and all new/changed content gets resubmitted.
const STATE_FILE = path.resolve(process.cwd(), ".indexnow-state.json");

// ─── State types ──────────────────────────────────────────────────────────────

interface IndexNowState {
  submittedAt: string;
  blogSlugs: string[];
  pageRoutes: string[];
}

function loadState(): IndexNowState | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {
    // Corrupt or missing — treat as first run
  }
  return null;
}

function saveState(state: IndexNowState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err: any) {
    console.warn(`[IndexNow] Could not save state file: ${err.message}`);
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export const PUBLIC_PAGES: string[] = (() => {
  const marketing = Object.keys(PAGE_META).map((r) => `${BASE_URL}${r}`);
  const blog = [
    `${BASE_URL}/blog`,
    ...BLOG_POSTS_META.map((p) => `${BASE_URL}/blog/${p.slug}`),
  ];
  const core = [
    `${BASE_URL}/`,
    `${BASE_URL}/pricing`,
    `${BASE_URL}/contact`,
    `${BASE_URL}/help`,
    `${BASE_URL}/privacy-policy`,
    `${BASE_URL}/terms-of-use`,
    `${BASE_URL}/realtor-growth-engine`,
  ];
  return Array.from(new Set([...core, ...marketing, ...blog])).filter(
    (u) =>
      !u.includes("/admin") &&
      !u.includes("/dashboard") &&
      !u.includes("/login") &&
      !u.includes("/auth") &&
      !u.includes("/settings") &&
      !u.includes("/api/")
  );
})();

// ─── Debounce queue ───────────────────────────────────────────────────────────

const pendingUrls = new Set<string>();
let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 5_000;

export function submitUrls(urls: string | string[]): void {
  const list = Array.isArray(urls) ? urls : [urls];
  for (const u of list) pendingUrls.add(u);

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const batch = Array.from(pendingUrls);
    pendingUrls.clear();
    debounceTimer = null;
    await submitNow(batch);
  }, DEBOUNCE_MS);
}

// ─── Core HTTP submission ─────────────────────────────────────────────────────

export async function submitNow(
  urls: string[]
): Promise<{ status: number; body: string; error?: string }> {
  const ts = new Date().toISOString();
  const unique = Array.from(new Set(urls));

  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList: unique,
  };

  try {
    const response = await fetch(INDEXNOW_API, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const body = await response.text();
    console.log(
      `[IndexNow] ${ts} | submitted ${unique.length} URL(s) | HTTP ${response.status} | ${body || "(empty)"}`
    );
    for (const u of unique) console.log(`[IndexNow]   → ${u}`);

    return { status: response.status, body };
  } catch (err: any) {
    console.error(
      `[IndexNow] ${ts} | FAILED | ${err.message} | URLs: ${unique.join(", ")}`
    );
    return { status: 0, body: "", error: err.message };
  }
}

export async function submitAllPublicPages(): Promise<{
  status: number;
  body: string;
  error?: string;
}> {
  console.log(
    `[IndexNow] Submitting all ${PUBLIC_PAGES.length} public pages...`
  );
  return submitNow(PUBLIC_PAGES);
}

// ─── Named event hooks ────────────────────────────────────────────────────────
// Call these wherever the matching content event occurs.

/** Call when a new blog post slug is added to BLOG_POSTS_META and deployed. */
export function onBlogPostPublished(slug: string): void {
  const urls = [`${BASE_URL}/blog`, `${BASE_URL}/blog/${slug}`];
  console.log(`[IndexNow] Blog post published: /blog/${slug}`);
  submitUrls(urls);
}

/** Call when a new route is added to PAGE_META (landing / feature / SEO page). */
export function onLandingPageCreated(path: string): void {
  const url = `${BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
  console.log(`[IndexNow] Landing page created: ${path}`);
  submitUrls([url]);
}

/** Call when existing page content or SEO metadata changes. */
export function onPageUpdated(path: string): void {
  const url = `${BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
  console.log(`[IndexNow] Page updated: ${path}`);
  submitUrls([url]);
}

// ─── Startup diff-and-submit ───────────────────────────────────────────────────
// Compares current content against the last persisted snapshot.
// Calls the appropriate named hook for each new item found.
// Falls back to submitting all pages when no prior state exists (first deploy).

export async function detectAndSubmitNewContent(): Promise<void> {
  const currentSlugs = BLOG_POSTS_META.map((p) => p.slug);
  const currentRoutes = Object.keys(PAGE_META);

  const state = loadState();

  if (!state) {
    // First run — no prior snapshot. Submit everything.
    console.log(
      "[IndexNow] No prior state found — submitting all public pages (first deploy or ephemeral filesystem)."
    );
    await submitAllPublicPages();
  } else {
    const prevSlugs = new Set(state.blogSlugs);
    const prevRoutes = new Set(state.pageRoutes);

    const newSlugs = currentSlugs.filter((s) => !prevSlugs.has(s));
    const newRoutes = currentRoutes.filter((r) => !prevRoutes.has(r));

    if (newSlugs.length === 0 && newRoutes.length === 0) {
      console.log("[IndexNow] No new blog posts or landing pages detected since last submission.");
      return;
    }

    if (newSlugs.length > 0) {
      console.log(
        `[IndexNow] Detected ${newSlugs.length} new blog post(s): ${newSlugs.join(", ")}`
      );
      for (const slug of newSlugs) onBlogPostPublished(slug);
    }

    if (newRoutes.length > 0) {
      console.log(
        `[IndexNow] Detected ${newRoutes.length} new landing page(s): ${newRoutes.join(", ")}`
      );
      for (const route of newRoutes) onLandingPageCreated(route);
    }

    // Wait for the debounce to flush before saving state
    await new Promise<void>((resolve) => setTimeout(resolve, DEBOUNCE_MS + 1_000));
  }

  saveState({
    submittedAt: new Date().toISOString(),
    blogSlugs: currentSlugs,
    pageRoutes: currentRoutes,
  });

  console.log("[IndexNow] State snapshot saved.");
}
