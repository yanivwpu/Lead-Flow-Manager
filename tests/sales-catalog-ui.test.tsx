import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { SalesCatalogView } from "../client/src/pages/SalesCatalogView";
import {
  APP_NAV_HREFS,
  APP_NAV_MAIN_ITEM_IDS,
  isAppNavItemActive,
} from "../shared/appNav";
import en from "../client/src/locales/en.json";
import es from "../client/src/locales/es.json";
import he from "../client/src/locales/he.json";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("catalog shell provides localized navigation and Hebrew RTL without fetching or sending", async () => {
  assert.equal(APP_NAV_HREFS.salesCatalog, "/app/sales-catalog");
  assert.ok(APP_NAV_MAIN_ITEM_IDS.includes("salesCatalog"));
  assert.ok(
    isAppNavItemActive("salesCatalog", "/app/sales-catalog?query=package"),
  );
  let requests = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    requests++;
    throw Error("Rendering must not make requests");
  };
  try {
    for (const [language, resource] of Object.entries({ en, es, he })) {
      const i18n = createInstance();
      await i18n.init({
        lng: language,
        resources: { [language]: { translation: resource } },
        interpolation: { escapeValue: false },
      });
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <SalesCatalogView>
            <p>Existing offer editor</p>
          </SalesCatalogView>
        </I18nextProvider>,
      );
      assert.ok(html.includes(resource.nav.salesCatalog));
      assert.ok(html.includes(resource.salesCatalog.shopifyNote));
      assert.ok(html.includes(language === "he" ? 'dir="rtl"' : 'dir="ltr"'));
      assert.ok(html.includes("sm:p-6"));
      assert.ok(html.includes("Existing offer editor"));
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
  }
});
