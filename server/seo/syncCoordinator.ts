/** Registers the property promise before its deferred executor can acquire a DB
 * lease. Local manual/scheduled followers therefore share the exact promise. */
export function createPropertySyncCoordinator<T>() {
  const inFlight = new Map<string, Promise<T>>();
  return {
    run(propertyId: string, execute: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(propertyId);
      if (existing) return existing;
      let tracked!: Promise<T>;
      const started = Promise.resolve().then(execute);
      tracked = started.finally(() => {
        if (inFlight.get(propertyId) === tracked) inFlight.delete(propertyId);
      });
      inFlight.set(propertyId, tracked);
      return tracked;
    },
    has(propertyId: string): boolean { return inFlight.has(propertyId); },
  };
}
