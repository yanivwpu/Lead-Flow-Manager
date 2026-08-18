export const UPGRADED_QUERY = "upgraded";
export const PLAN_CHECKOUT_SUCCESS_PATH = "/app/inbox?upgraded=1";

/** One-time success marker: consume `upgraded=1` so refresh does not toast again. */
export function consumeUpgradedQueryParam(
  pathname: string,
  search: string,
  hash = "",
): { consumed: boolean; nextUrl: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get(UPGRADED_QUERY) !== "1") {
    return { consumed: false, nextUrl: `${pathname}${search}${hash}` };
  }
  params.delete(UPGRADED_QUERY);
  const qs = params.toString();
  return {
    consumed: true,
    nextUrl: `${pathname}${qs ? `?${qs}` : ""}${hash}`,
  };
}
