const inflight = new Map<string, AbortController>();

export function registerWebchatGenerationAbort(conversationId: string, controller: AbortController): void {
  abortWebchatGeneration(conversationId);
  inflight.set(conversationId, controller);
}

export function abortWebchatGeneration(conversationId: string): void {
  const existing = inflight.get(conversationId);
  if (!existing) return;
  existing.abort();
  inflight.delete(conversationId);
}

export function clearWebchatGenerationAbort(conversationId: string, controller: AbortController): void {
  if (inflight.get(conversationId) === controller) {
    inflight.delete(conversationId);
  }
}
