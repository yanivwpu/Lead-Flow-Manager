import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import en from "../client/src/locales/en.json";
import he from "../client/src/locales/he.json";
import es from "../client/src/locales/es.json";

test("buyer setup, shortlist and MLS status retain canonical behavior across dashboard languages", { timeout: 120_000 }, async (t) => {
  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") return t.skip("Chromium runs in RGE CI");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true });
  t.after(() => browser.close());
  const result = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { InventorySourcesSection } from "./client/src/components/inventory/InventorySourcesSection.tsx";
      import { CopilotInventoryEmptyState } from "./client/src/components/inventory/CopilotInventoryEmptyState.tsx";
      import { BuyerPreferencesPanel } from "./client/src/components/BuyerPreferencesPanel.tsx";
      import { InventoryMatchRecommendationCard } from "./client/src/components/inventory/InventoryMatchRecommendationCard.tsx";
      import { SavedInventoryMatches } from "./client/src/components/inventory/SavedInventoryMatches.tsx";
      import i18n from "i18next";
      import { initReactI18next } from "react-i18next";
      import en from "./client/src/locales/en.json";
      import he from "./client/src/locales/he.json";
      import es from "./client/src/locales/es.json";
      const resources = { en: { translation: en }, he: { translation: he }, es: { translation: es } };
      const match = { listingId: "sample-property", providerListingId: "MLS-471", score: 91, reasons: ["Within budget"],
        listing: { id: "sample-property", providerListingId: "MLS-471", status: "Active",
          city: "Tel Aviv", state: null, addressLine1: "12 רחוב Herzl", priceCents: 55000000,
          beds: 3, baths: 2.5, propertyType: "house", listingUrl: null, thumbnailUrl: null } };
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => ({ eligible: false }) } } });
      window.changeLocale = async (lang) => {
        await i18n.changeLanguage(lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = i18n.dir(lang);
      };
      i18n.use(initReactI18next).init({ lng: window.fixtureLocale, resources }).then(async () => {
        await window.changeLocale(window.fixtureLocale);
        createRoot(document.getElementById("root")).render(
          <QueryClientProvider client={client}>
            <BuyerPreferencesPanel contactId="fixture" manualSetupOnly />
            {window.fixtureConnected
              ? <InventoryMatchRecommendationCard contactId="fixture" match={match} saved={false} onSavedChange={() => {}} />
              : <CopilotInventoryEmptyState />}
            <InventorySourcesSection variant="compact" />
            <SavedInventoryMatches contactId="fixture" onSavedChange={() => {}} />
          </QueryClientProvider>
        );
      });
    `, resolveDir: process.cwd(), loader: "tsx" },
    plugins: [{
      name: "isolated-matching-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/(?:auth-context|shopifyMerchantExperience)$/ }, args =>
          ({ path: args.path, namespace: "matching-fixtures" }));
        builder.onLoad({ filter: /.*/, namespace: "matching-fixtures" }, () => ({
          contents: 'export const useAuth = () => ({ user: { id: "fixture" } }); export const useHideGrowthEngineForShopify = () => false;',
        }));
      },
    }],
    bundle: true, write: false, platform: "browser", jsx: "automatic", alias: { "@": "./client/src", "@shared": "./shared" },
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env": '{"PROD":false}' }, loader: { ".css": "empty" }, logOverride: { "empty-import-meta": "silent" },
  });

  for (const [language, dictionary] of Object.entries({ en, he, es })) {
    const page = await browser.newPage({ viewport: { width: language === "en" ? 1280 : 390, height: 780 } });
    t.after(() => page.close());
    page.setDefaultTimeout(5000);
    const payloads: unknown[] = [];
    let connected = false;
    const source = {
      id: "source-1", provider: "mls_grid", displayName: "Fixture MLS",
      connectionStatus: "error", lastSyncStatus: "failed",
      lastSyncError: "MLS Grid HTTP 401: synthetic-sensitive-provider-detail", config: {},
      lastSyncStats: {}, isActive: true, listingSyncSupported: true, hasCredentials: true, listingCount: 5,
    };
    await page.route("https://matching.fixture.test/**", (route) => {
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
      if (["PATCH", "POST"].includes(route.request().method())) payloads.push(route.request().postDataJSON());
      const { pathname } = new URL(route.request().url());
      if (pathname === "/api/inventory/status") {
        return route.fulfill({ json: { canUse: true, featureEnabled: true, rgeInstalled: true, reason: "ok" } });
      }
      if (pathname === "/api/inventory/sources") {
        return route.fulfill({ json: { sources: connected ? [source] : [] } });
      }
      return route.fulfill({ json: { matches: [], totalSaved: 0, unavailable: 0 } });
    });
    async function loadFixture() {
      await page.goto("https://matching.fixture.test/");
      await page.evaluate((settings) => { Object.assign(window, settings); }, { fixtureLocale: language, fixtureConnected: connected });
      await page.addScriptTag({ content: result.outputFiles[0].text });
    }
    await loadFixture();
    await page.getByTestId("copilot-inventory-empty-state").getByText(dictionary.inboxUi.connectInventoryToEnableMatchingListingsAndPrice).waitFor();
    assert.equal(await page.getByTestId("inventory-connected-sources").count(), 0);
    connected = true;
    await loadFixture();
    await page.getByTestId("inventory-source-connection-state").getByText(dictionary.rgeMatching.needsAttention).waitFor();
    await page.getByTestId("inventory-sync-error").getByText(dictionary.rgeMatching.providerAuth).waitFor();
    assert.equal(await page.getByText("synthetic-sensitive-provider-detail", { exact: false }).count(), 0);
    await page.getByText(dictionary.rgeMatching.savedEmpty).waitFor();
    assert.equal(await page.locator("html").getAttribute("dir"), language === "he" ? "rtl" : "ltr");
    const matchingCard = page.getByTestId("inventory-match-sample-property");
    await matchingCard.getByText("12 רחוב Herzl").waitFor();
    await matchingCard.getByText(dictionary.rgeMatching.budget, { exact: true }).waitFor();
    await page.getByTestId("button-setup-property-matching").click();
    await page.getByLabel(dictionary.inboxUi.areasCommaSeparated).fill("Tel Aviv");
    await page.getByLabel(dictionary.inboxUi.budgetMax).fill("550000");
    await page.getByLabel(dictionary.inboxUi.bedsMin).fill("3");
    const propertyType = page.getByRole("combobox", { name: dictionary.inboxUi.propertyType });
    await propertyType.focus();
    await propertyType.press("Enter");
    await page.getByRole("option", { name: dictionary.inboxUi.house, exact: true }).click();
    const next = language === "he" ? "es" : "he";
    await page.evaluate((lang) => (window as unknown as { changeLocale: (value: string) => Promise<void> }).changeLocale(lang), next);
    assert.deepEqual(payloads, []);
    const nextUi = next === "he" ? he.inboxUi : es.inboxUi;
    await page.getByRole("button", { name: nextUi.saveAndEnableMatching }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.deepEqual(payloads, [{
      confirmRealEstateEnrollment: true, targetAreas: ["Tel Aviv"], priceMax: 550000, bedsMin: 3, propertyTypes: ["house"],
    }]);
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/inventory-matches/saved") && response.request().method() === "POST"),
      page.getByTestId("button-save-match-sample-property").click(),
    ]);
    assert.deepEqual(payloads[1], { listingId: "sample-property", score: 91, reasons: ["Within budget"] });
  }
});
