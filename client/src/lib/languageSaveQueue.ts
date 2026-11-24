import type { UserLanguage } from "@shared/userLanguage";

/** Serialize writes for one session so a slow response cannot restore an older choice. */
export function createLanguageSaveQueue(save: (language: UserLanguage, accountId: string) => Promise<boolean>) {
  let known: UserLanguage | null = null;
  let pending: Promise<unknown> = Promise.resolve();
  let session = 0;

  return {
    reset() {
      session++;
      known = null;
    },
    confirm(language: UserLanguage) {
      known = language;
    },
    enqueue(language: UserLanguage, accountId: string) {
      const requestedSession = session;
      const result = pending.then(async () => {
        if (requestedSession !== session || language === known) return true;
        const saved = await save(language, accountId);
        if (saved && requestedSession === session) known = language;
        return saved;
      });
      pending = result.catch(() => undefined);
      return result;
    },
  };
}
