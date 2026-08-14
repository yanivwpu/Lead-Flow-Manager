/**
 * Conditional BullMQ worker startup when REDIS_URL is present.
 * Run: npx tsx --test tests/worker-redis-gate.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { isRedisUrlConfigured } from "../server/queue";

describe("isRedisUrlConfigured", () => {
  it("returns true when REDIS_URL is non-empty", () => {
    assert.equal(isRedisUrlConfigured({ REDIS_URL: "redis://127.0.0.1:6379" } as NodeJS.ProcessEnv), true);
    assert.equal(
      isRedisUrlConfigured({ REDIS_URL: "  rediss://default:x@example.upstash.io:6379  " } as NodeJS.ProcessEnv),
      true,
    );
  });

  it("returns false when REDIS_URL is blank or missing", () => {
    assert.equal(isRedisUrlConfigured({} as NodeJS.ProcessEnv), false);
    assert.equal(isRedisUrlConfigured({ REDIS_URL: "" } as NodeJS.ProcessEnv), false);
    assert.equal(isRedisUrlConfigured({ REDIS_URL: "   " } as NodeJS.ProcessEnv), false);
  });
});

describe("worker startup gate wiring", () => {
  it("web server gates worker on isRedisUrlConfigured and exports startInboxWorker", () => {
    const indexSrc = fs.readFileSync(path.join(process.cwd(), "server/index.ts"), "utf8");
    const workerSrc = fs.readFileSync(path.join(process.cwd(), "server/worker.ts"), "utf8");
    assert.match(indexSrc, /isRedisUrlConfigured\(\)/);
    assert.match(indexSrc, /startInboxWorker/);
    assert.match(indexSrc, /REDIS_URL not configured — background worker disabled/);
    assert.doesNotMatch(indexSrc, /^import ["']\.\/worker["']/m);
    assert.match(workerSrc, /export function startInboxWorker/);
    assert.match(workerSrc, /isWorkerEntrypoint/);
    // Redis connection only inside startInboxWorker (not at module top-level load)
    const createAt = workerSrc.indexOf("createRedisConnection()");
    const startAt = workerSrc.indexOf("export function startInboxWorker");
    assert.ok(startAt >= 0 && createAt > startAt, "createRedisConnection must live inside startInboxWorker");
  });
});
