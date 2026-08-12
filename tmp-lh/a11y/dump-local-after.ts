import fs from "node:fs";

function dump(path: string, label: string) {
  if (!fs.existsSync(path)) {
    console.log(`MISSING ${path}`);
    return;
  }
  const j = JSON.parse(fs.readFileSync(path, "utf8"));
  console.log(
    `\n==== ${label} a11y=${j.categories?.accessibility?.score} perf=${j.categories?.performance?.score} cls=${j.audits?.["cumulative-layout-shift"]?.numericValue}`,
  );
  const refs = j.categories?.accessibility?.auditRefs || [];
  let fails = 0;
  for (const r of refs) {
    const a = j.audits[r.id];
    if (!a || a.score === null || a.score === undefined || a.score === 1) continue;
    fails++;
    console.log(`\nFAIL ${r.id} score=${a.score} | ${a.title}`);
    for (const it of (a.details?.items || []).slice(0, 8)) {
      const n = it.node || {};
      console.log(
        "  NODE",
        JSON.stringify({
          sel: n.selector,
          snip: (n.snippet || "").slice(0, 180),
          label: n.nodeLabel,
        }),
      );
    }
  }
  console.log(`Total failing audits: ${fails}`);
}

dump("tmp-lh/a11y/local-desktop-after.json", "local-desktop-after");
dump("tmp-lh/a11y/local-mobile-after.json", "local-mobile-after");
