import { ShoppingSettings } from "./ShoppingSettings";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CommerceProduct, CommerceVariant } from "@shared/commerceCatalog";
import { ShopifyCatalogView } from "./ShopifyCatalogView";
export function ShopifyCatalog({ showShoppingSettings = true, authorizationOrigin }: { showShoppingSettings?: boolean; authorizationOrigin?: "ecommerce" } = {}) {
  const { user, sessionAligned } = useAuth();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string | undefined>(),
    [history, setHistory] = useState<Array<string | undefined>>([]),
    [selected, setSelected] = useState<CommerceProduct | null>(null),
    [guidance, setGuidance] = useState(""),
    [notes, setNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [variantCursor, setVariantCursor] = useState<string>();
  const [variantHistory, setVariantHistory] = useState<
    Array<string | undefined>
  >([]);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(query);
      setSearchCategory(category);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, category]);
  const key = ["/api/sales-catalog/commerce", user?.id];
  const status = useQuery<any>({
    queryKey: [...key, "status"],
    enabled: !!user && sessionAligned,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      const r = await fetch("/api/sales-catalog/commerce/status", {
        credentials: "include",
      });
      if (!r.ok) throw Error(t("salesCatalog.commerce.error"));
      return r.json();
    },
  });
  const products = useQuery<{
    items: CommerceProduct[];
    nextCursor: string | null;
  }>({
    queryKey: [
      ...key,
      "products",
      searchQuery,
      cursor,
      statusFilter,
      searchCategory,
    ],
    enabled: !!user && sessionAligned && !!status.data?.sourceId,
    retry: false,
    // Keep the visible bounded page current even when a short webhook sync is missed.
    refetchInterval: 15_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        query: searchQuery,
        ...(cursor ? { cursor } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(searchCategory ? { category: searchCategory } : {}),
      });
      const r = await fetch(`/api/sales-catalog/commerce/products?${params}`, {
        credentials: "include",
      });
      if (!r.ok) throw Error(t("salesCatalog.commerce.error"));
      return r.json();
    },
  });
  const detail = useQuery<{ item: CommerceProduct }>({
    queryKey: [...key, "detail", selected?.id],
    enabled: !!selected && !!user && sessionAligned,
    refetchInterval: 15_000,
    queryFn: async () => {
      const r = await fetch(
        `/api/sales-catalog/commerce/products/${selected!.id}`,
        { credentials: "include" },
      );
      if (!r.ok) throw Error(t("salesCatalog.commerce.error"));
      return r.json();
    },
  });
  const variantPage = useQuery<{
    items: Array<CommerceVariant & { quantity: number | null }>;
    nextCursor: string | null;
  }>({
    queryKey: [...key, "variants", selected?.id, variantCursor],
    enabled: !!selected && !!user && sessionAligned,
    refetchInterval: 15_000,
    queryFn: async () => {
      const params = new URLSearchParams(
        variantCursor ? { cursor: variantCursor } : {},
      );
      const r = await fetch(
        `/api/sales-catalog/commerce/products/${selected!.id}/variants?${params}`,
        { credentials: "include" },
      );
      if (!r.ok) throw Error(t("salesCatalog.commerce.error"));
      return r.json();
    },
  });
  const currentProduct = detail.data?.item ?? selected;
  const sync = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/sales-catalog/commerce/sync", {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      setError("");
    },
    onError: (e: Error) => setError(e.message),
  });
  const save = useMutation({
    mutationFn: async () =>
      apiRequest(
        "PATCH",
        `/api/sales-catalog/commerce/products/${selected!.id}`,
        {
          aiGuidance: guidance || null,
          notes: notes || null,
          merchantTags: tags
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, 20),
        },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      setSelected(null);
      setError("");
    },
    onError: (e: Error) => setError(e.message),
  });
  useEffect(() => {
    setSelected(null);
    setCursor(undefined);
    setHistory([]);
    setError("");
  }, [user?.id]);
  return (
    <div className="space-y-4">
      {showShoppingSettings && <ShoppingSettings />}
      <ShopifyCatalogView
        authorizationOrigin={authorizationOrigin}
        status={status.data}
        items={products.data?.items ?? []}
        loading={status.isLoading || products.isLoading}
        error={error || status.error?.message || products.error?.message}
        query={query}
        onQuery={(v) => {
          setQuery(v);
          setCursor(undefined);
          setHistory([]);
        }}
        onSync={() => sync.mutate()}
        syncing={sync.isPending}
        onSelect={(p) => {
          setSelected(p);
          setGuidance(p.aiGuidance || "");
          setNotes(p.notes || "");
          setTags(
            Array.isArray(p.merchantTags) ? p.merchantTags.join(", ") : "",
          );
          setVariantCursor(undefined);
          setVariantHistory([]);
        }}
      />
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="block mb-1">
            {t("salesCatalog.commerce.statusFilter")}
          </span>
          <select
            className="rounded-md border p-2"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCursor(undefined);
              setHistory([]);
            }}
          >
            <option value="">{t("salesCatalog.commerce.allStatuses")}</option>
            {["ACTIVE", "DRAFT", "ARCHIVED"].map((v) => (
              <option key={v} value={v}>
                {t(`salesCatalog.commerce.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1">
            {t("salesCatalog.commerce.category")}
          </span>
          <Input
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCursor(undefined);
              setHistory([]);
            }}
          />
        </label>
      </div>
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={!history.length}
          onClick={() => {
            const previous = [...history];
            setCursor(previous.pop());
            setHistory(previous);
          }}
        >
          {t("salesCatalog.previous")}
        </Button>
        <Button
          variant="outline"
          disabled={!products.data?.nextCursor}
          onClick={() => {
            setHistory([...history, cursor]);
            setCursor(products.data?.nextCursor ?? undefined);
          }}
        >
          {t("salesCatalog.next")}
        </Button>
      </div>
      {currentProduct && (
        <section
          className="rounded-xl border bg-white p-4 space-y-4"
          aria-label={t("salesCatalog.commerce.details")}
        >
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold">{currentProduct.title}</h2>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t("salesCatalog.commerce.close")}
            </Button>
          </div>
          <p className="text-sm text-gray-600">{currentProduct.description}</p>
          <p className="text-sm">
            {currentProduct.collections.map((c) => c.title).join(" · ")}
          </p>
          <div className="flex gap-2 overflow-x-auto">
            {currentProduct.images.map((i) => (
              <img
                key={i.url}
                src={i.url}
                alt={i.altText || currentProduct.title}
                className="h-24 w-24 rounded-lg object-cover"
                loading="lazy"
              />
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {t("salesCatalog.commerce.readOnly")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr>
                  <th>{t("salesCatalog.commerce.variant")}</th>
                  <th>{t("salesCatalog.commerce.price")}</th>
                  <th>{t("salesCatalog.commerce.inventory")}</th>
                </tr>
              </thead>
              <tbody>
                {(variantPage.data?.items ?? []).map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="py-2 pe-3">
                      {v.title}
                      {Array.isArray(v.options) && (
                        <span className="block text-xs">
                          {v.options
                            .map((o: any) => `${o.name}: ${o.value}`)
                            .join(" · ")}
                        </span>
                      )}
                      <span className="block text-xs text-gray-500" dir="ltr">
                        {v.sku}
                      </span>
                    </td>
                    <td className="pe-3" dir="ltr">
                      {v.price ?? "—"} {v.currency}
                    </td>
                    <td>
                      {t(`salesCatalog.commerce.${v.availability}`)}
                      {v.tracked && v.quantity !== null ? (
                        <span className="block text-xs text-gray-500">
                          {v.quantity} ·{" "}
                          {new Date(v.verifiedAt).toLocaleString(i18n.language)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {variantPage.error && (
            <p role="alert" className="text-red-700">
              {variantPage.error.message}
            </p>
          )}
          <div className="flex justify-between">
            <Button
              variant="outline"
              disabled={!variantHistory.length}
              onClick={() => {
                const h = [...variantHistory];
                setVariantCursor(h.pop());
                setVariantHistory(h);
              }}
            >
              {t("salesCatalog.previous")}
            </Button>
            <Button
              variant="outline"
              disabled={!variantPage.data?.nextCursor}
              onClick={() => {
                setVariantHistory([...variantHistory, variantCursor]);
                setVariantCursor(variantPage.data?.nextCursor ?? undefined);
              }}
            >
              {t("salesCatalog.next")}
            </Button>
          </div>
          {currentProduct.productUrl && (
            <a
              href={currentProduct.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-green underline"
            >
              {t("salesCatalog.commerce.openShopify")}
            </a>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              {t("salesCatalog.commerce.guidance")}
            </span>
            <Textarea
              value={guidance}
              maxLength={1500}
              onChange={(e) => setGuidance(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              {t("salesCatalog.commerce.notes")}
            </span>
            <Textarea
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              {t("salesCatalog.commerce.tags")}
            </span>
            <span className="block text-xs text-muted-foreground">{t("salesCatalog.commerce.shoppingRulesHint")}</span>
            <Input
              value={tags}
              maxLength={800}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {t("salesCatalog.commerce.save")}
          </Button>
        </section>
      )}
    </div>
  );
}
