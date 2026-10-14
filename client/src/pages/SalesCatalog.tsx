import { OffersPaymentLinksSettings } from "@/components/settings/OffersPaymentLinksSettings";
import { SalesCatalogView } from "./SalesCatalogView";

export function SalesCatalog() {
  return (
    <SalesCatalogView>
      <OffersPaymentLinksSettings catalog />
    </SalesCatalogView>
  );
}
