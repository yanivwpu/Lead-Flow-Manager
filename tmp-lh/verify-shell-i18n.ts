import fs from "node:fs";
import { injectLocalizedStaticShell } from "../server/seo.ts";

const html = fs.readFileSync("client/index.html", "utf8");
for (const locale of ["es", "he"]) {
  const out = injectLocalizedStaticShell(html, locale);
  const start = out.indexOf('<header class="wcs-nav"');
  const end = out.indexOf("</header>", start);
  const chunk = out.slice(start, end + 9);
  console.log("====", locale, "====");
  console.log(chunk);
  console.log("Product EN leftover?", /Product</.test(chunk));
  console.log("Pricing EN leftover?", />Pricing</.test(chunk));
}

