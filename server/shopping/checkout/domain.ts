import type { CatalogDb } from "../../salesCatalog/commerceStore";
import { resolveCatalogInstallation } from "../../salesCatalog/shopify/installation";
import { shopifyCatalogRequest } from "../../salesCatalog/shopify/api";
import { CheckoutError } from "./contract";
/** Exact host attestation via the existing owned Admin client; never accepts browser allowlists or follows redirects. */
export async function checkoutDomain(database:CatalogDb,userId:string,shop:string,requestFor=shopifyCatalogRequest) {
 const install=await resolveCatalogInstallation(database,userId,shop);
 if(!install)throw new CheckoutError("setup_required");
 let data:any;
 try {data=await requestFor(install.shop,install.token)(`query CheckoutDomain { shop { myshopifyDomain primaryDomain { host } } }`);}catch {throw new CheckoutError("unavailable");}
 const host=data?.shop?.primaryDomain?.host;
 if(data?.shop?.myshopifyDomain!==shop || typeof host!=="string" || host.length>253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host))throw new CheckoutError("invalid_response");
 const current=await resolveCatalogInstallation(database,userId,shop);
 if(!current || current.integrationId!==install.integrationId || current.token!==install.token)throw new CheckoutError("setup_required");
 return host;
}
