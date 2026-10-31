/** Root-page exception for Shopify merchant onboarding. No operational API, data or send access. */
export function isEcommerceOnboardingDocumentRequest(method: string, path: string, view: unknown): boolean {
  return (method === "GET" || method === "HEAD") &&
    (path === "/" || path === "") &&
    (view === "setup" || view === "about");
}
