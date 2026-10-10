import { normalizeDiagnosticTypeProperties } from "./typecheck-diagnostic-normalization.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const base = process.env.TYPECHECK_BASE_SHA;
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error("TYPECHECK_BASE_SHA must be an exact base commit");
const workspace = process.cwd();
const parent = mkdtempSync(join(tmpdir(), "shopify-typecheck-"));
const baseline = join(parent, "baseline");
const compiler = resolve("node_modules/typescript/bin/tsc");

function check(directory) {
  const result = spawnSync(process.execPath, [compiler, "--noEmit", "--incremental", "false", "--pretty", "false"],
    { cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  // Inferred import types contain absolute checkout paths; normalize both worktrees equally.
  const output = ((result.stdout || "") + (result.stderr || "")).replaceAll(directory, "<repo>");
  const lines = output.split("\n");
  const diagnostics = new Map();
  let current = "";
  const save = () => {
    if (current) {
      const normalized = normalizeDiagnosticTypeProperties(current);
      diagnostics.set(normalized, (diagnostics.get(normalized) || 0) + 1);
    }
    current = "";
  };
  for (const line of lines) {
    if (/^.+\(\d+,\d+\): error TS\d+:/.test(line)) {
      save();
      current = line.replace(/\(\d+,\d+\):/, ":");
    } else if (current && line.trim()) current += "\n" + line;
  }
  save();
  if (result.status !== 0 && diagnostics.size === 0) throw new Error(output || "TypeScript failed without diagnostics");
  return { diagnostics, count: [...diagnostics.values()].reduce((a, b) => a + b, 0) };
}

try {
  execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", base], { stdio: "pipe" });
  execFileSync("git", ["worktree", "add", "--detach", baseline, base], { stdio: "pipe" });
  symlinkSync(join(workspace, "node_modules"), join(baseline, "node_modules"), "dir");
  const previous = check(baseline);
  const candidate = check(workspace);
  const added = [];
  for (const [message, count] of candidate.diagnostics) {
    for (let i = previous.diagnostics.get(message) || 0; i < count; i++) added.push(message);
  }
  console.log(`TypeScript diagnostics: base=${previous.count}, PR=${candidate.count}, added=${added.length}`);
  if (previous.count) console.log("The repository-wide typecheck already fails on the base; this check rejects any additional diagnostics.");
  if (added.length) {
    console.error(added.join("\n\n"));
    const removed = [...previous.diagnostics.keys()].filter(message => !candidate.diagnostics.has(message));
    if (removed.length) console.error("Base-only diagnostics for comparison:\\n".replace("\\\\n", "\\n") + removed.join("\n\n"));
    process.exitCode = 1;
  }
} finally {
  try { execFileSync("git", ["worktree", "remove", "--force", baseline], { stdio: "pipe" }); } catch {}
  rmSync(parent, { recursive: true, force: true });
}
