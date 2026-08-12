import fs from "node:fs";

const d = fs.readFileSync("dist/public/index.html", "utf8");
const i = fs.readFileSync("client/index.html", "utf8");
const mh = fs.readFileSync("client/src/components/marketing/MarketingHeader.tsx", "utf8");
const css = fs.readFileSync("client/src/index.css", "utf8");
const seo = fs.readFileSync("server/seo.ts", "utf8");
const w = fs.readFileSync("client/src/pages/Welcome.tsx", "utf8");

const checks = {
  dist_nav_actions: d.includes("wcs-nav-actions"),
  dist_scrollbar: d.includes("scrollbar-gutter: stable"),
  dist_host56: d.includes("#wcs-react-header-host { position: relative; height: 56px"),
  dist_hide_lg: d.includes("wcs-hide-lg-down"),
  shell_lg1024:
    i.includes("@media (min-width: 1024px)") && i.includes(".wcs-nav-center { display: flex; }"),
  react_lg: mh.includes("hidden justify-self-center lg:block"),
  react_h: mh.includes("h-14") && mh.includes("md:h-[60px]"),
  css_host: css.includes("height: 56px") && css.includes("min-height: 60px"),
  css_gutter: css.includes("scrollbar-gutter: stable"),
  seo_rtl: seo.includes('class="rtl"') && seo.includes("wcs-nav-center"),
  welcome_inert: w.includes('setAttribute("inert"') || w.includes("setAttribute('inert'"),
  welcome_shell: w.includes("wcs-homepage-shell-live"),
};
console.log(JSON.stringify(checks, null, 2));

const c = i.indexOf('class="wcs-nav-center"');
const a = i.indexOf('class="wcs-nav-actions"');
const p = i.indexOf('href="/prospect-ai">Product');
const pr = i.indexOf('href="/pricing">Pricing');
console.log({
  orderOk: c < a && p > c && p < a && pr > a,
  h1: (i.match(/id="whachat-static-hero-title"/g) || []).length,
});

const before = JSON.parse(fs.readFileSync("tmp-lh/prod-cls/summary.json", "utf8"));
console.log(
  "before",
  before.map((x: { id: string; cls: number }) => ({ id: x.id, cls: x.cls })),
);
const after = JSON.parse(fs.readFileSync("tmp-lh/prod-cls-after/summary.json", "utf8"));
console.log(
  "after",
  after.map((x: any) => ({
    id: x.id,
    cls: x.final?.cls,
    host: [x.earlyGeom?.host?.h, x.final?.host?.h],
    width: [x.earlyGeom?.width, x.final?.width],
  })),
);
