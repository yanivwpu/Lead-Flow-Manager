import { writeFileSync, renameSync } from "node:fs";
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';

type Scope = { active: boolean };
/** One coordinator per application process. No Redis pause or customer-job cancellation. */
export class RuntimeDrain {
  private draining = false;
  private scopes = new AsyncLocalStorage<Scope>();
  private active = new Map<string, number>();
  private stoppers = new Map<string, () => void | Promise<void>>();
  private waiters = new Set<() => void>();
  private completion?: Promise<void>;
  get isDraining() { return this.draining; }
  snapshot() { return { draining: this.draining, active: Object.fromEntries(this.active) }; }
  register(name: string, stop: () => void | Promise<void>) {
    if (this.draining) throw new Error('Cannot start a worker while draining');
    this.stoppers.set(name, stop);
  }
  async run<T>(name: string, work: () => T | Promise<T>): Promise<T> {
    // Existing admitted work can complete nested operations, including its provider response.
    if (this.draining && !this.scopes.getStore()?.active) throw Object.assign(new Error('Service draining; retry later'), { status: 503, code: 'SERVICE_DRAINING' });
    const scope: Scope = { active: true };
    this.active.set(name, (this.active.get(name) || 0) + 1);
    try { return await this.scopes.run(scope, work); }
    finally {
      scope.active = false;
      const count = this.active.get(name)! - 1;
      if (count) this.active.set(name, count); else this.active.delete(name);
      if (!this.active.size) for (const wake of this.waiters) wake();
    }
  }
  async scheduled<T>(name: string, work: () => T | Promise<T>): Promise<T | undefined> {
    if (this.draining) return;
    return this.run(name, work);
  }
  begin(): Promise<void> {
    if (this.completion) return this.completion;
    this.draining = true; // Synchronous admission fence, before any await.
    this.completion = (async () => {
      // Local worker.close/pause stops acquisition; active work remains tracked and may finish.
      const results = await Promise.allSettled([...this.stoppers.values()].map(stop => Promise.resolve().then(stop)));
      if (results.some(r => r.status === 'rejected')) throw new Error('Drain stop hook failed; do not cut over');
      if (this.active.size) await new Promise<void>(resolve => this.waiters.add(resolve));
    })();
    return this.completion;
  }
}
export const runtimeDrain = new RuntimeDrain();
export const runScheduledWork = <T>(name: string, work: () => T | Promise<T>) => runtimeDrain.scheduled(name, work);
export const runTrackedWork = <T>(name: string, work: () => T | Promise<T>) => runtimeDrain.run(name, work);

export const createDrainHttpGate = (coordinator: RuntimeDrain): RequestHandler => (req, res, next) => {
  if (!coordinator.isDraining || req.path === '/api/health' || req.path === '/health') return next();
  res.setHeader('Retry-After', '30');
  res.status(503).json({ error: 'SERVICE_DRAINING', retryable: true });
};

export const drainHttpGate = createDrainHttpGate(runtimeDrain);

/** Track actual async route completion, including work done after res.send(). No Express globals patched. */
export function trackHttpHandlers(stack: any[], route = false, coordinator = runtimeDrain): void {
  for (const layer of stack || []) {
    if (layer.route?.stack) trackHttpHandlers(layer.route.stack, true, coordinator);
    else if (layer.handle?.stack) trackHttpHandlers(layer.handle.stack, false, coordinator);
    else if (route && typeof layer.handle === 'function' && layer.handle.length < 4 && !layer.handle.__drainTracked) {
      const original = layer.handle;
      const wrapped = function(req: any, res: any, next: any) {
        if (coordinator.isDraining && (req.path === '/health' || req.path === '/api/health')) return original(req, res, next);
        return coordinator.run('http', () => original(req, res, next)).catch(error => {
          if (error.code === 'SERVICE_DRAINING' && !res.headersSent) return res.status(503).set('Retry-After', '30').json({ error: 'SERVICE_DRAINING', retryable: true });
          if (!res.headersSent) next(error);
        });
      };
      wrapped.__drainTracked = true;
      layer.handle = wrapped;
    }
  }
}

/** SIGUSR2 quiesces without exiting. An operator waits for drain_ready before removing a deployment. */
export function installDrainSignals(onExit?: () => void): void {
  const statusFile = process.env.RUNTIME_DRAIN_STATUS_FILE || '/tmp/whachat-runtime-drain.json';
  const record = (state: string) => {
    const safe = { state, pid: process.pid, deployment: process.env.RAILWAY_DEPLOYMENT_ID || null,
      project: process.env.RAILWAY_PROJECT_ID || null, environment: process.env.RAILWAY_ENVIRONMENT_ID || null,
      service: process.env.RAILWAY_SERVICE_ID || null, commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
      ...runtimeDrain.snapshot() };
    try { writeFileSync(statusFile + '.tmp', JSON.stringify(safe), { mode: 0o600 }); renameSync(statusFile + '.tmp', statusFile); }
    catch { console.error(JSON.stringify({ event: 'drain_status_unavailable', action: 'do_not_cut_over' })); }
  };
  record('running');
  let exitRequested = false;
  let started = false;
  const drain = (exit: boolean) => {
    exitRequested ||= exit;
    if (!started) {
      started = true;
      record('draining');
      console.info(JSON.stringify({ event: 'drain_started', deployment: process.env.RAILWAY_DEPLOYMENT_ID || null }));
      const report = setInterval(() => { record('draining'); console.info(JSON.stringify({ event: 'drain_waiting', ...runtimeDrain.snapshot() })); }, 5000);
      report.unref();
      void runtimeDrain.begin().then(() => {
        clearInterval(report);
        record('ready');
        console.info(JSON.stringify({ event: 'drain_ready', deployment: process.env.RAILWAY_DEPLOYMENT_ID || null, ...runtimeDrain.snapshot() }));
        if (exitRequested) { onExit?.(); process.exit(0); }
      }).catch(() => {
        clearInterval(report);
        record('failed');
        console.error(JSON.stringify({ event: 'drain_failed', action: 'do_not_cut_over' }));
      });
    } else if (exit && !Object.keys(runtimeDrain.snapshot().active).length) {
      // Only exit through the successful completion promise, never after a failed stop hook.
      void runtimeDrain.begin().then(() => { onExit?.(); process.exit(0); }).catch(() => {});
    }
  };
  process.on('SIGUSR2', () => drain(false));
  process.on('SIGTERM', () => drain(true));
  process.on('SIGINT', () => drain(true));
}
