/** Path (+ optional search) for Stripe cancel/success routing — must stay same-origin paths. */
export function getCheckoutReturnPaths(): { redirectTo: string; cancelTo: string } {
  if (typeof window === "undefined") {
    return { redirectTo: "/app/inbox", cancelTo: "/app/inbox" };
  }
  const path = `${window.location.pathname}${window.location.search}`;
  return { redirectTo: path, cancelTo: path };
}
