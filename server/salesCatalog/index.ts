import { db } from "../../drizzle/db";
import { createSalesCatalogService } from "./service";
export const salesCatalog = createSalesCatalogService(db);
