import type { QueryClient } from "@tanstack/react-query";

function isContactDeletionQueryKey(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  if (typeof head !== "string") return false;
  if (head === "/api/contacts" || head.startsWith("/api/contacts/")) return true;
  if (head === "/api/inbox" || head.startsWith("/api/inbox/")) return true;
  if (head === "/api/appointments" || head.startsWith("/api/appointments/")) return true;
  if (head === "/api/campaign-enrollments" || head.startsWith("/api/campaign-enrollments/")) return true;
  return false;
}

/** Invalidate user-scoped CRM caches after a hard contact delete (prefix match keeps account scope). */
export function invalidateQueriesAfterContactDeletion(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (query) => isContactDeletionQueryKey(query.queryKey),
  });
}
