import fs from "node:fs";

function dump(path: string, label: string) {
  const j = JSON.parse(fs.readFileSync(path, "utf8"));
  console.log(`\n==== ${label} score=${j.categories?.accessibility?.score}`);
  const refs = j.categories?.accessibility?.auditRefs || [];
  let fails = 0;
  for (const r of refs) {
    const a = j.audits[r.id];
    if (!a || a.score === null || a.score === undefined || a.score === 1) continue;
    fails++;
    console.log(`\nFAIL ${r.id} score=${a.score} | ${a.title}`);
    console.log(`  desc: ${(a.description || "").slice(0, 220)}`);
    for (const it of a.details?.items || []) {
      const n = it.node || {};
      console.log(
        "  NODE",
        JSON.stringify({
          sel: n.selector,
          snip: (n.snippet || "").slice(0, 260),
          label: n.nodeLabel,
          expl: (n.explanation || "").slice(0, 220),
        }),
      );
      if (it.contrastRatio != null) {
        console.log(
          "   contrast",
          it.contrastRatio,
          "fg",
          it.fgColor || it.fg,
          "bg",
          it.bgColor || it.bg,
          "fs",
          it.fontSize,
          "fw",
          it.fontWeight,
        );
      }
    }
  }
  console.log(`\nTotal failing audits: ${fails}`);
}

dump("tmp-lh/a11y/prod-desktop.json", "desktop");
dump("tmp-lh/a11y/prod-mobile.json", "mobile");
