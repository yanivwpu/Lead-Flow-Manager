import { useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShopifyCatalog } from "@/components/ShopifyCatalog";
import { OffersPaymentLinksSettings } from "@/components/settings/OffersPaymentLinksSettings";
import { SalesCatalogView } from "./SalesCatalogView";

export function SalesCatalog() {
  const search = useSearch();
  const [source, setSource] = useState(
    new URLSearchParams(search).get("source") === "shopify"
      ? "shopify"
      : "manual",
  );
  const { t } = useTranslation();
  return (
    <SalesCatalogView>
      <Tabs value={source} onValueChange={setSource}>
        <TabsList>
          <TabsTrigger value="manual">
            {t("salesCatalog.commerce.manual")}
          </TabsTrigger>
          <TabsTrigger value="shopify">
            {t("salesCatalog.commerce.shopify")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manual">
          <OffersPaymentLinksSettings catalog />
        </TabsContent>
        <TabsContent value="shopify">
          <ShopifyCatalog />
        </TabsContent>
      </Tabs>
    </SalesCatalogView>
  );
}
