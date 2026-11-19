/** ACK only complete persistence. Retry transient failures with the provider's original event ID. */
export function requireInboundPersistence(result: { success?: boolean; message?: unknown; contact?: unknown; conversation?: unknown }): void {
  if (!result.success || !result.message || !result.contact || !result.conversation) {
    throw Object.assign(new Error('Inbound persistence incomplete; retry delivery'), { status: 503 });
  }
}
