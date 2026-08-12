import fs from "node:fs";
const j = JSON.parse(fs.readFileSync("tmp-lh/a11y/local-desktop-after.json", "utf8"));
for (const it of j.audits["color-contrast"].details.items) {
  console.log({
    label: it.node?.nodeLabel,
    fg: it.fgColor || it.fg,
    bg: it.bgColor || it.bg,
    ratio: it.contrastRatio,
    expected: it.expectedContrastRatio,
    expl: (it.node?.explanation || "").slice(0, 180),
  });
}
console.log(
  "logo expl",
  j.audits["label-content-name-mismatch"].details.items[0].node.explanation,
);
