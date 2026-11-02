import { productInformationGaps } from "@shared/commerceCatalog";
import { useTranslation } from "react-i18next";
import type { CommerceProduct } from "@shared/commerceCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ShopifyCatalogView(props: {
  status?: {
    status: string;
    connection: string;
    missingScopes: string[];
    eligibleProductCount: number;
    publishedProductCount?: number;
    inventoryUnverifiedProductCount?: number;
    inventoryCapability: string;
    lastSyncAt: string | null;
    freshness: string;
    authorizationEnabled: boolean;
    sourceId: string | null;
  };
  items: CommerceProduct[];
  authorizationOrigin?: "ecommerce";
  loading: boolean;
  error?: string;
  query: string;
  onQuery(v: string): void;
  onSync(): void;
  syncing: boolean;
  onSelect(p: CommerceProduct): void;
}) {
  const { t, i18n } = useTranslation();
  const s = props.status;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Shopify</h2>
            <p className="mt-1 text-sm text-gray-600">
              {t(`salesCatalog.commerce.${s?.status ?? "loading"}`)}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={props.syncing || s?.connection !== "connected"}
            onClick={props.onSync}
          >
            {t("salesCatalog.commerce.retry")}
          </Button>
        </div>
        {s?.missingScopes.length ? (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p>{t("salesCatalog.commerce.accessRequired")}</p>
            {s.authorizationEnabled ? (
              <a
                href={props.authorizationOrigin === "ecommerce" ? "/api/shopify/catalog/authorize?origin=ecommerce" : "/api/shopify/catalog/authorize"}
                className="mt-2 inline-block font-semibold underline"
              >
                {t("salesCatalog.commerce.approve")}
              </a>
            ) : (
              <p className="mt-1">
                {t("salesCatalog.commerce.releaseRequired")}
              </p>
            )}
          </div>
        ) : null}
        {s && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
            <span>
              {s.eligibleProductCount} {t("salesCatalog.commerce.products")}
            </span>
            {s.publishedProductCount !== undefined && (
              <span>
                {s.publishedProductCount}{" "}
                {t("salesCatalog.commerce.publishedProducts")}
              </span>
            )}
            {s.inventoryUnverifiedProductCount !== undefined && (
              <span>
                {s.inventoryUnverifiedProductCount}{" "}
                {t("salesCatalog.commerce.inventoryUnverified")}
              </span>
            )}
            <span>
              {t("salesCatalog.commerce.freshness")}:{" "}
              {t(
                `salesCatalog.commerce.${s.freshness === "fresh" ? "fresh" : "stale"}`,
              )}
            </span>
            <span>
              {t("salesCatalog.commerce.lastSync")}:{" "}
              {s.lastSyncAt
                ? new Date(s.lastSyncAt).toLocaleString(i18n.language)
                : t("salesCatalog.commerce.notSynced")}
            </span>
          </div>
        )}
      </section>
      <Input
        maxLength={200}
        aria-label={t("salesCatalog.search")}
        placeholder={t("salesCatalog.search")}
        value={props.query}
        onChange={(e) => props.onQuery(e.target.value)}
      />
      {props.error && (
        <p role="alert" className="text-sm text-red-700">
          {props.error}
        </p>
      )}
      {props.loading ? (
        <p role="status" className="text-sm text-gray-500">
          {t("salesCatalog.commerce.loading")}
        </p>
      ) : !props.items.length ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
          {t("salesCatalog.commerce.empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {props.items.map((p) => (
            <button
              key={p.id}
              onClick={() => props.onSelect(p)}
              className="flex flex-col rounded-xl border bg-white p-4 text-start shadow-sm hover:border-brand-green focus-visible:outline focus-visible:outline-brand-green"
            >
              <div className="flex w-full gap-3">
                {p.images[0] ? (
                  <img
                    src={p.images[0].url}
                    alt={p.images[0].altText || p.title}
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-lg bg-gray-100" />
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{p.title}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Shopify · {t(`salesCatalog.commerce.${p.status}`)}
                  </p>
                </div>
              </div>
              {productInformationGaps(p).length > 0 && (
                <p className="mt-2 text-xs text-amber-800">
                  {productInformationGaps(p).map(gap => t(`salesCatalog.commerce.missing${gap === "description" ? "Description" : "Guidance"}`)).join(" · ")}
                </p>
              )}
              <p className="mt-3 text-sm" dir="ltr">
                {p.minPrice ?? "—"}
                {p.maxPrice && p.maxPrice !== p.minPrice
                  ? ` – ${p.maxPrice}`
                  : ""}{" "}
                {p.currency ?? ""}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {p.variantCount} {t("salesCatalog.commerce.variants")} ·{" "}
                {p.productType}
              </p>
              <p className="mt-2 text-xs font-medium">
                {t(
                  `salesCatalog.commerce.${p.published ? "published" : "unpublished"}`,
                )}
                {" · "}
                {t(`salesCatalog.commerce.${p.availability ?? "unavailable"}`)}
                {p.freshness === "stale" && (
                  <> · {t("salesCatalog.commerce.stale")}</>
                )}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
