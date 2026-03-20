import crypto from "crypto";
import fs from "fs";
import path from "path";
import { BLOG_POSTS_META, PAGE_META } from "./seo";

// ─── Constants ────────────────────────────────────────────────────────────────

const INDEXNOW_KEY = "9726ec610d574c62b33130ba828766eb";
const HOST = "whachatcrm.com";
const BASE_URL = `https://${HOST}`;
const KEY_LOCATION = `${BASE_URL}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_API = "https://api.indexnow.org/indexnow";

// Persists submission state between restarts. In production (autoscale) the
// filesystem is ephemeral, so this file won't survive a fresh deploy — that is
// intentional: every deploy falls back to a full resubmission.
const STATE_FILE = path.resolve(process.cwd(), ".indexnow-state.json");

// ─── State types ──────────────────────────────────────────────────────────────

interface IndexNowState {
  submittedAt: string;
  blogSlugs: string[];
  pageRoutes: string[];
  // SHA-256 fingerprint of each page's metadata. Keyed by the URL path:
  //   "/blog/my-slug" for blog posts, "/pricing" for PAGE_META routes.
  contentHashes: Record<string, string>;
}

function loadState(): IndexNowState | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as IndexNowState;
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

// ─── Content fingerprinting ───────────────────────────────────────────────────
// Deterministic SHA-256 hash of all SEO-relevant metadata fields for a page.
// A hash change means the page's content or SEO data was edited and needs
// resubmission to IndexNow.

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function computeContentHashes(): Record<string, string> {
  const hashes: Record<string, string> = {};

  // Hash each blog post's full metadata (title, excerpt, date, category, readTime, featured)
  for (const post of BLOG_POSTS_META) {
    const fingerprint = JSON.stringify({
      title: post.title,
      excerpt: post.excerpt,
      date: post.date,
      category: post.category,
      readTime: post.readTime,
      featured: post.featured ?? false,
    });
    hashes[`/blog/${post.slug}`] = sha256(fingerprint);
  }

  // Hash each PAGE_META route's full metadata (title, description, canonical, ogImage)
  for (const [route, meta] of Object.entries(PAGE_META)) {
    const fingerprint = JSON.stringify({
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      ogImage: meta.ogImage ?? "",
    });
    hashes[route] = sha256(fingerprint);
  }

  return hashes;
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

/** Call when a new blog post slug is added to BLOG_POSTS_META and deployed. */
export function onBlogPostPublished(slug: string): void {
  const urls = [`${BASE_URL}/blog`, `${BASE_URL}/blog/${slug}`];
  console.log(`[IndexNow] Blog post published: /blog/${slug}`);
  submitUrls(urls);
}

/** Call when a new route is added to PAGE_META (landing / feature / SEO page). */
export function onLandingPageCreated(routePath: string): void {
  const url = `${BASE_URL}${routePath.startsWith("/") ? routePath : "/" + routePath}`;
  console.log(`[IndexNow] Landing page created: ${routePath}`);
  submitUrls([url]);
}

/**
 * Call when existing page content or SEO metadata changes.
 * Wired automatically by detectAndSubmitNewContent() when it detects a
 * fingerprint change on any blog post or PAGE_META route.
 */
export function onPageUpdated(routePath: string): void {
  const url = `${BASE_URL}${routePath.startsWith("/") ? routePath : "/" + routePath}`;
  console.log(`[IndexNow] Page updated: ${routePath}`);
  submitUrls([url]);
}

// ─── Startup diff-and-submit ──────────────────────────────────────────────────
// Runs on every production startup (10s delay, called from server/index.ts).
//
// Detects three categories of change since the last saved snapshot:
//   1. New blog post slug       → onBlogPostPublished(slug)
//   2. New PAGE_META route      → onLandingPageCreated(route)
//   3. Changed content/metadata → onPageUpdated(path)   ← covers edits to
//      blog post title/excerpt/date/category/readTime/featured AND any
//      PAGE_META route's title/description/canonical/ogImage
//
// If no prior snapshot exists (first deploy, or ephemeral production filesystem
// after a fresh deploy) → submitAllPublicPages() and save a fresh snapshot.

export async function detectAndSubmitNewContent(): Promise<void> {
  const currentSlugs = BLOG_POSTS_META.map((p) => p.slug);
  const currentRoutes = Object.keys(PAGE_META);
  const currentHashes = computeContentHashes();

  const state = loadState();

  if (!state) {
    console.log(
      "[IndexNow] No prior state — submitting all public pages (first deploy or ephemeral filesystem)."
    );
    await submitAllPublicPages();
  } else {
    const prevSlugs = new Set(state.blogSlugs);
    const prevRoutes = new Set(state.pageRoutes);
    const prevHashes: Record<string, string> = state.contentHashes ?? {};

    // ── 1. New blog posts ────────────────────────────────────────────────────
    const newSlugs = currentSlugs.filter((s) => !prevSlugs.has(s));
    if (newSlugs.length > 0) {
      console.log(
        `[IndexNow] New blog post(s) detected: ${newSlugs.join(", ")}`
      );
      for (const slug of newSlugs) onBlogPostPublished(slug);
    }

    // ── 2. New landing / SEO pages ───────────────────────────────────────────
    const newRoutes = currentRoutes.filter((r) => !prevRoutes.has(r));
    if (newRoutes.length > 0) {
      console.log(
        `[IndexNow] New landing page(s) detected: ${newRoutes.join(", ")}`
      );
      for (const route of newRoutes) onLandingPageCreated(route);
    }

    // ── 3. Edited content (fingerprint changed on existing pages) ────────────
    const existingPaths = Object.keys(currentHashes).filter(
      (p) =>
        // Exclude pages that were just detected as "new" above
        !newSlugs.some((s) => p === `/blog/${s}`) &&
        !newRoutes.includes(p)
    );

    const changedPaths = existingPaths.filter(
      (p) => prevHashes[p] !== undefined && prevHashes[p] !== currentHashes[p]
    );

    if (changedPaths.length > 0) {
      console.log(
        `[IndexNow] Edited page(s) detected (content/metadata changed): ${changedPaths.join(", ")}`
      );
      for (const p of changedPaths) onPageUpdated(p);
    }

    if (newSlugs.length === 0 && newRoutes.length === 0 && changedPaths.length === 0) {
      console.log("[IndexNow] No content changes detected since last submission.");
      // Save an updated snapshot (refreshes submittedAt) but don't submit anything.
      saveState({
        submittedAt: new Date().toISOString(),
        blogSlugs: currentSlugs,
        pageRoutes: currentRoutes,
        contentHashes: currentHashes,
      });
      return;
    }

    // Wait for the debounce timer to flush all queued URLs before saving state.
    await new Promise<void>((resolve) => setTimeout(resolve, DEBOUNCE_MS + 1_000));
  }

  saveState({
    submittedAt: new Date().toISOString(),
    blogSlugs: currentSlugs,
    pageRoutes: currentRoutes,
    contentHashes: currentHashes,
  });

  console.log("[IndexNow] State snapshot saved.");
}
