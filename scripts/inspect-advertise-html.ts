import "dotenv/config";

const url = process.argv[2] || "https://affordablepompano.com/advertise";

async function main() {
  const res = await fetch(url, { headers: { "user-agent": "WhachatCRM-audit/1.0" } });
  const html = await res.text();
  console.log({ status: res.status, len: html.length });

  const forms = html.match(/<form[\s\S]*?<\/form>/gi) || [];
  console.log("forms", forms.length);
  for (const [i, form] of forms.entries()) {
    console.log(`\n--- FORM ${i} ---`);
    console.log(form.slice(0, 1200));
  }

  const submitLabels = [
    ...(html.match(/type=["']submit["'][^>]*>/gi) || []),
    ...(html.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || []),
  ].slice(0, 30);
  console.log("\n--- BUTTONS/SUBMITS ---");
  for (const b of submitLabels) console.log(b.replace(/\s+/g, " ").slice(0, 220));

  const apply = html.match(/Apply for a listing[\s\S]{0,200}/gi) || [];
  console.log("\n--- APPLY SNIPPETS ---");
  for (const a of apply) console.log(a.replace(/\s+/g, " ").slice(0, 220));

  const timing = html.match(/1\s*[-–—]?\s*2\s*business[\s\S]{0,80}/gi) || [];
  console.log("\n--- TIMING ---");
  for (const t of timing) console.log(t.replace(/\s+/g, " ").slice(0, 200));

  const headings = (html.match(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi) || [])
    .map((h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  console.log("\n--- HEADINGS ---");
  console.log(headings.slice(0, 40));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
