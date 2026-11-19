/** Browser-local durable unsent messages. Never mix widget/visitor identities. No automatic expiry. */
export type WebchatOutboxEntry = {
  id: string;
  widgetId: string;
  visitorId: string;
  text: string;
  file?: File;
  body: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  nextAttemptAt: number;
};
const databaseName = 'whachat-unsent-v1';
let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('messages', { keyPath: ['widgetId', 'visitorId', 'id'] });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = undefined; reject(new Error('Durable message storage unavailable')); };
  });
}
async function mutate(work: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    work(tx.objectStore('messages'));
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error('Durable message storage unavailable'));
  });
}
export const saveWebchatPending = (entry: WebchatOutboxEntry) => mutate(store => store.put(entry));
export const removeWebchatPending = (widgetId: string, visitorId: string, id: string) => mutate(store => store.delete([widgetId, visitorId, id]));
export async function listWebchatPending(widgetId: string, visitorId: string): Promise<WebchatOutboxEntry[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction('messages').objectStore('messages').getAll();
    r.onsuccess = () => resolve((r.result as WebchatOutboxEntry[])
      .filter(row => row.widgetId === widgetId && row.visitorId === visitorId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    r.onerror = () => reject(new Error('Durable message storage unavailable'));
  });
}
export function webchatRetryDelay(attempts: number, retryAfterSeconds = 0): number {
  return Math.max(Math.min(15_000 * 2 ** Math.min(attempts, 5), 300_000), Math.min(Math.max(retryAfterSeconds, 0), 3600) * 1000);
}
