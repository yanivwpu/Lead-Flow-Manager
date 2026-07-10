/**
 * Print OAuth authorize URL debug snapshot (no secrets).
 * Run: npx tsx scripts/preview-ghl-oauth-url.ts
 */
import { buildGhlOAuthAuthorizeDebugSnapshot } from "../server/ghlOAuthDebug";

const snapshot = buildGhlOAuthAuthorizeDebugSnapshot("debug-user");
console.log(JSON.stringify(snapshot, null, 2));
