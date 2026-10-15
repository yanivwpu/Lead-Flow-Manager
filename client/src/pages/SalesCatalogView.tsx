import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

export function SalesCatalogView({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  return (
    <div
      className="h-full overflow-y-auto p-4 sm:p-6"
      dir={i18n.language.startsWith("he") ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("nav.salesCatalog", "Sales Catalog")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            {t(
              "salesCatalog.intro",
              "Manage the offers and packages your team and AI Brain use in customer conversations.",
            )}
          </p>
        </header>
        {children}
        <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          {t(
            "salesCatalog.shopifyNote",
            "Shopify prices and stock are read-only. Manage them in Shopify; AI guidance and merchant notes stay here.",
          )}
        </aside>
      </div>
    </div>
  );
}
