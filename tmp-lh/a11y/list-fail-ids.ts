import fs from "node:fs";

for (const f of ["tmp-lh/a11y/prod-desktop.json", "tmp-lh/a11y/prod-mobile.json"]) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  console.log("FILE", f, "score", j.categories.accessibility.score);
  for (const [id, a] of Object.entries(j.audits) as [string, any][]) {
    if (!a || typeof a !== "object") continue;
    const score = a.score;
    if (score === 1 || score === null || score === undefined) continue;
    console.log(id, score, a.title);
  }
}
