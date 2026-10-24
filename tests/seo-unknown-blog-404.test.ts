import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(root,"server/static.ts"),"utf8");
const blogHandler=source.slice(source.indexOf('app.get("/blog/:slug"'),source.indexOf("// Marketing pages with SSR"));
assert.ok(blogHandler.includes('if (!ssrContent) {'),"unknown blog slugs explicitly checked");
assert.match(blogHandler,/if \(!ssrContent\)\s*\{[\s\S]*?return sendNotFoundSpaShell\(res, indexPath\)/,"unknown blog slugs return actual 404 shell");
assert.match(source,/function sendNotFoundSpaShell[\s\S]*?res\.status\(404\)/,"404 shell sets HTTP status");
assert.match(source,/function sendNotFoundSpaShell[\s\S]*?injectNoindexMeta\(html\)/,"404 shell is not indexable");
console.log("Unknown blog slug SEO 404 regression checks passed");
