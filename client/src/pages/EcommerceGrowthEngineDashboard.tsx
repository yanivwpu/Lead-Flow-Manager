import { EcommerceWorkspaceBoundary, useEcommercePilot } from "@/lib/ecommercePilot";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { ShoppingBag, Package, ShoppingCart, Brain, RefreshCw, Repeat2, Settings, CheckCircle2, ArrowRight, ListTodo } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { ShopifySimpleSetup } from "@/components/integrations/ShopifySimpleSetup";
import { ShopifyPostPurchasePreview } from "@/components/ecommerce/ShopifyPostPurchasePreview";
import { ShopifyCatalog } from "@/components/ShopifyCatalog";
import { ShoppingSettings } from "@/components/ShoppingSettings";
import { useEcommerceMerchantActivationStatus } from "@/lib/ecommerceMerchantActivation";

const translations = {
 en: {title:"E-Commerce Growth Engine", subtitle:"Products, orders and customer journeys in one place.", connected:"Shopify connected", disconnected:"Shopify not connected", unavailable:"Connection status unavailable", overview:"Overview", products:"Products", orders:"Orders", shopping:"AI Shopping", recovery:"Cart Recovery", post:"Post-Purchase", settings:"Settings", orderTasks:"Order support tasks", shop:"Store", manage:"Manage", start:"Connect Shopify", productDetail:"View your synced Shopify catalog, variants, prices and inventory.", ordersDetail:"Shopify customer purchases are recorded with contacts. Order-support tasks live in Follow-ups.", shoppingDetail:"Test your shopping assistant and configure recommendations here.", recoveryDetail:"Recovery reminders are not active. Setup and approved consent are required.", recoveryReady:"Infrastructure ready. Customer delivery remains off.", recoveryMissing:"Recovery setup is not complete. Customer delivery remains off.", recoveryUnknown:"Recovery readiness unavailable. Customer delivery remains off.", postDetail:"Post-purchase customer messaging is not active.", settingsDetail:"Manage your Shopify connection and sync preferences.", noStats:"Live metrics will appear when their sources are available.", recent:"Quick access", seeCatalog:"Open Shopify products", seeContacts:"Customer purchase records", seeTasks:"Follow-ups", seeBrain:"AI Brain", synced:"Connected store", status:"Customer journeys off", enabledStatus:"Customer journeys active", unknownStatus:"Status unavailable", published:"Published", available:"Verified available now", setup:"Shopify setup", noDuplicate:"The catalog and customer records are shared with WhachatCRM; no separate data is created."},
 es: {title:"Motor de comercio electrónico", subtitle:"Productos, pedidos y recorridos del cliente en un lugar.",connected:"Shopify conectado",disconnected:"Shopify no conectado",unavailable:"Estado de conexión no disponible",overview:"Resumen",products:"Productos",orders:"Pedidos",shopping:"Compras con IA",recovery:"Recuperación de carritos",post:"Poscompra",settings:"Configuración",orderTasks:"Tareas de pedidos",shop:"Tienda",manage:"Gestionar",start:"Conectar Shopify",productDetail:"Consulta el catálogo Shopify, variantes, precios e inventario.",ordersDetail:"Las compras se guardan con los contactos; las tareas están en Seguimientos.",shoppingDetail:"Prueba el asistente y configura las recomendaciones aquí.",recoveryDetail:"Los recordatorios no están activos. Se requiere configuración y consentimiento aprobado.",recoveryReady:"Infraestructura lista. El envío a clientes sigue desactivado.",recoveryMissing:"Falta completar la configuración. El envío sigue desactivado.",recoveryUnknown:"Estado de recuperación no disponible. El envío sigue desactivado.",postDetail:"Los mensajes poscompra no están activos.",settingsDetail:"Gestiona Shopify y las preferencias de sincronización.",noStats:"Las métricas aparecerán cuando estén disponibles.",recent:"Accesos rápidos",seeCatalog:"Abrir productos Shopify",seeContacts:"Historial de clientes",seeTasks:"Seguimientos",seeBrain:"AI Brain",synced:"Tienda conectada",status:"Recorridos de clientes desactivados",enabledStatus:"Recorridos de clientes activos",unknownStatus:"Estado no disponible",published:"Publicados",available:"Disponibles verificados ahora",setup:"Configurar Shopify",noDuplicate:"Los productos y clientes se comparten con WhachatCRM sin duplicar datos."},
 he: {title:"מנוע צמיחה למסחר אלקטרוני",subtitle:"מוצרים, הזמנות ומסעות לקוח במקום אחד.",connected:"Shopify מחובר",disconnected:"Shopify לא מחובר",unavailable:"סטטוס החיבור אינו זמין",overview:"סקירה",products:"מוצרים",orders:"הזמנות",shopping:"קניות AI",recovery:"שחזור עגלות",post:"לאחר רכישה",settings:"הגדרות",orderTasks:"משימות הזמנה",shop:"חנות",manage:"ניהול",start:"חיבור Shopify",productDetail:"צפייה בקטלוג Shopify, גרסאות, מחירים ומלאי.",ordersDetail:"רכישות נשמרות ברשומות אנשי קשר; המשימות באזור המעקב.",shoppingDetail:"בדיקת עוזר הקניות והגדרת המלצות כאן.",recoveryDetail:"תזכורות שחזור אינן פעילות. נדרשות הגדרה והסכמה מאושרת.",recoveryReady:"התשתית מוכנה. משלוח הודעות ללקוחות עדיין מושבת.",recoveryMissing:"הגדרת השחזור טרם הושלמה. משלוח הודעות מושבת.",recoveryUnknown:"מצב מוכנות השחזור אינו זמין. משלוח הודעות מושבת.",postDetail:"הודעות לאחר רכישה אינן פעילות.",settingsDetail:"ניהול חיבור Shopify והסנכרון.",noStats:"נתונים יוצגו כאשר יהיו זמינים.",recent:"גישה מהירה",seeCatalog:"פתיחת מוצרי Shopify",seeContacts:"רכישות לקוחות",seeTasks:"מעקבים",seeBrain:"AI Brain",synced:"חנות מחוברת",status:"מסעות לקוח מושבתים",enabledStatus:"מסעות לקוח פעילים",unknownStatus:"הסטטוס אינו זמין",published:"פורסמו",available:"זמינים ומאומתים כעת",setup:"הגדרת Shopify",noDuplicate:"הקטלוג ורשומות הלקוחות משותפים ללא שכפול נתונים."}
} as const;
type View = "overview" | "products" | "orders" | "shopping" | "recovery" | "post" | "settings";
export function EcommerceGrowthEngineDashboardContent() {
 const {i18n}=useTranslation();
 const locale=(i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
 const t=translations[locale as keyof typeof translations] || translations.en;
 const search=useSearch();
 const selected=new URLSearchParams(search).get("view");
 const view:View=(["overview","products","orders","shopping","recovery","post","settings"] as string[]).includes(selected || "") ? selected as View : "overview";
 const {user,sessionAligned}=useAuth();
 // Only the already-authorized private pilot sees in-development merchant controls.
 const {available:privatePilot}=useEcommercePilot();
 const {data,isLoading,isError}=useQuery<{connected:boolean;shop:string|null;syncEnabled:boolean}>({
   queryKey:withUserQueryScope(["/api/shopify/connection-status"],user?.id),
   queryFn:async()=>{const response=await fetch("/api/shopify/connection-status",{credentials:"include"});if(!response.ok)throw new Error("Connection unavailable");return response.json();},
   enabled:!!user?.id && sessionAligned,retry:false
 });
 const activation = useEcommerceMerchantActivationStatus();
 const commerceStatus = useQuery<{publishedProductCount?:number;eligibleProductCount?:number}>({
   queryKey:withUserQueryScope(["/api/sales-catalog/commerce/status"],user?.id),
   enabled:privatePilot && !!user?.id && sessionAligned && data?.connected===true && view==="overview",
   retry:false,
   queryFn:async()=>{
     const response=await fetch("/api/sales-catalog/commerce/status",{credentials:"include",cache:"no-store"});
     if(!response.ok)throw new Error("Catalog unavailable");
     return response.json();
   }
 });
 const hasJourneyStatus=!activation.isLoading&&!activation.isError && typeof (activation.data as {outboundMessagingEnabled?:boolean}|undefined)?.outboundMessagingEnabled === "boolean";
 const journeyLabel=hasJourneyStatus ? ((activation.data as {outboundMessagingEnabled?:boolean}).outboundMessagingEnabled === true ? t.enabledStatus : t.status) : t.unknownStatus;
 const labels:{id:View;label:string;icon:typeof ShoppingBag}[]=[
  {id:"overview",label:t.overview,icon:ShoppingBag},{id:"products",label:t.products,icon:Package},{id:"orders",label:t.orders,icon:ShoppingCart},
  {id:"shopping",label:t.shopping,icon:Brain},{id:"recovery",label:t.recovery,icon:RefreshCw},{id:"post",label:t.post,icon:Repeat2},{id:"settings",label:t.settings,icon:Settings}
 ];
 const catalog="/app/sales-catalog?source=shopify";
 const links=[{label:t.seeCatalog,href:catalog},{label:t.seeContacts,href:"/app/contacts"},{label:t.seeTasks,href:"/app/followups"},{label:t.seeBrain,href:"/app/ai-brain"}];
 const heading=labels.find(x=>x.id===view)?.label || t.overview;
 return <main data-testid="ecommerce-growth-engine-dashboard" dir={locale==="he"?"rtl":"ltr"} lang={locale} className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-16 sm:p-8">
   <header className="rounded-2xl border border-blue-100 bg-white p-5 sm:p-6">
     <div className="flex flex-wrap items-start justify-between gap-3">
       <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-700"><ShoppingBag className="h-4 w-4"/> Shopify</div><h1 className="text-2xl font-bold text-slate-950">{t.title}</h1><p className="mt-1 text-sm text-slate-600">{t.subtitle}</p></div>
       <span data-testid="ecommerce-journey-status" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{journeyLabel}</span>
     </div>
     <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
       {!isLoading && !isError && data?.connected ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/>:null}
       <span>{isLoading?t.unavailable:isError?t.unavailable:data?.connected?t.connected:t.disconnected}</span>
       {data?.connected && data.shop && <span className="text-xs" dir="ltr">· {data.shop}</span>}
       {!data?.connected && !isLoading && <Link href="/app/integrations?setup=shopify" className="font-medium text-blue-700">{t.start}</Link>}
     </div>
   </header>
   <section aria-label={heading} className="space-y-4">
     <h2 className="text-xl font-semibold text-slate-950">{heading}</h2>
     {view==="overview" && <>
       {privatePilot && data?.connected===true && commerceStatus.data && !commerceStatus.isError &&
         <p data-testid="ecommerce-catalog-summary" className="text-sm text-slate-600">
           {t.published}: {Number.isFinite(commerceStatus.data.publishedProductCount) ? commerceStatus.data.publishedProductCount : "—"}
           <span className="mx-2" aria-hidden="true">·</span>
           {t.available}: {Number.isFinite(commerceStatus.data.eligibleProductCount) ? commerceStatus.data.eligibleProductCount : "—"}
         </p>}
       <div className="grid gap-3 sm:grid-cols-3">
         {[{label:t.products,href:catalog,icon:Package},{label:t.orders,href:"/app/ecommerce-growth-engine?view=orders",icon:ShoppingCart},{label:t.orderTasks,href:"/app/followups",icon:ListTodo}].map(c=><Link key={c.label} href={c.href} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300"><c.icon className="mb-3 h-5 w-5 text-blue-600"/><div className="font-semibold">{c.label}</div><p className="mt-2 text-xs text-slate-500">{t.manage} →</p></Link>)}
       </div>
       <div className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">{t.recent}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{links.map(l=><Link key={l.href} href={l.href} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">{l.label}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></Link>)}</div></div>
     </>}
     {view==="products" && <div className="rounded-xl border bg-white p-6"><p className="mb-4 text-slate-600">{t.productDetail}</p><ShopifyCatalog showShoppingSettings={!privatePilot}/><p className="mt-4 text-xs text-slate-500">{t.noDuplicate}</p></div>}
     {view==="orders" && <div className="rounded-xl border bg-white p-6"><p className="mb-4 text-slate-600">{t.ordersDetail}</p><div className="flex flex-wrap gap-5"><Link href="/app/contacts" className="font-semibold text-blue-700">{t.seeContacts} →</Link><Link href="/app/followups" className="font-semibold text-blue-700">{t.seeTasks} →</Link></div></div>}
     {view==="shopping" && <div className="rounded-xl border bg-white p-6 space-y-4">
       <p className="text-sm text-slate-600">{t.shoppingDetail}</p>
       {privatePilot && <ShoppingSettings/>}
       <div className="flex flex-wrap gap-5"><Link href="/app/ai-brain" className="font-semibold text-blue-700">{t.seeBrain} →</Link><Link href={catalog} className="font-semibold text-blue-700">{t.seeCatalog} →</Link></div>
     </div>}
     {view==="recovery" && <div className="rounded-xl border bg-white p-6 space-y-3 text-sm text-slate-600">
       <p>{t.recoveryDetail}</p>
       {privatePilot && <p data-testid="ecommerce-recovery-readiness" role="status" className="font-medium text-slate-700">
         {activation.isLoading || activation.isError || !activation.data || activation.data.recoverySchemaReady == null
           ? t.recoveryUnknown
           : activation.data.recoverySchemaReady === true ? t.recoveryReady : t.recoveryMissing}
       </p>}
     </div>}
     {view==="post" && <div className="space-y-4"><p className="text-sm text-slate-600">{t.postDetail}</p><ShopifyPostPurchasePreview connected={data?.connected === true}/></div>}
     {view==="settings" && <div className="space-y-4"><p className="text-sm text-slate-600">{t.settingsDetail}</p>{data?.connected ? <ShopifySimpleSetup syncEnabled={data.syncEnabled === true}/> : <Link href="/app/integrations?setup=shopify" className="font-semibold text-blue-700">{t.setup} →</Link>}</div>}
   </section>
 </main>;
}
export function EcommerceGrowthEngineDashboard(){return <EcommerceWorkspaceBoundary><EcommerceGrowthEngineDashboardContent/></EcommerceWorkspaceBoundary>;}
