import { Link, useSearch } from "wouter";
import {
  LogOut,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "./LanguageSelector";
import { TrialSetupCluster } from "@/components/TrialSetupCluster";
import { getDirection } from "@/lib/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InboxActivityNavBadge } from "@/components/InboxActivityNavBadge";
import { useAppNavCategories } from "@/lib/useAppNav";


function readCollapsed(): boolean {
  try {
    return localStorage.getItem("sidebar-collapsed") === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(val: boolean) {
  try {
    localStorage.setItem("sidebar-collapsed", String(val));
  } catch {}
}

export function Sidebar() {
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const isRTL = getDirection() === "rtl";
  const { categories, allItems } = useAppNavCategories();
  const commerceSearch = useSearch();
  const commerceViewParam = new URLSearchParams(commerceSearch).get("view");
  const selectedCommerceView = ["products", "orders", "shopping", "recovery", "post", "settings"].includes(commerceViewParam || "") ? commerceViewParam : "overview";
  const commerceSubnav = [
    {id:"overview", en:"Overview", es:"Resumen", he:"סקירה", href:"/app/ecommerce-growth-engine"},
    {id:"products", en:"Products", es:"Productos", he:"מוצרים", href:"/app/ecommerce-growth-engine?view=products"},
    {id:"orders", en:"Orders", es:"Pedidos", he:"הזמנות", href:"/app/ecommerce-growth-engine?view=orders"},
    {id:"shopping", en:"AI Shopping", es:"Compras con IA", he:"קניות AI", href:"/app/ecommerce-growth-engine?view=shopping"},
    {id:"recovery", en:"Cart Recovery", es:"Recuperación", he:"שחזור עגלות", href:"/app/ecommerce-growth-engine?view=recovery"},
    {id:"post", en:"Post-Purchase", es:"Poscompra", he:"לאחר רכישה", href:"/app/ecommerce-growth-engine?view=post"},
    {id:"settings", en:"Settings", es:"Configuración", he:"הגדרות", href:"/app/ecommerce-growth-engine?view=settings"},
  ];
  const { i18n } = useTranslation();
  const commerceLocale=(i18n.resolvedLanguage || i18n.language || "en").slice(0,2);

  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const [commerceExpanded, setCommerceExpanded] = useState(true);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const tooltipSide = isRTL ? "left" : "right";
  const sidebarTooltipClass =
    "border border-gray-200/90 bg-gray-100 text-gray-700 text-[11px] leading-snug shadow-none px-2.5 py-1.5 font-normal";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "hidden md:flex h-full flex-col bg-gray-50 z-20 transition-all duration-200 ease-in-out flex-shrink-0 overflow-x-hidden",
          isRTL ? "border-is" : "border-ie",
          collapsed ? "w-16 min-w-16 items-center" : "w-[200px] min-w-[200px] items-stretch"
        )}
        data-testid="sidebar"
      >
        {/* ── Logo + Toggle ── */}
        <div
          className={cn(
            "flex items-center flex-shrink-0",
            collapsed ? "justify-center px-0 flex-col gap-3 pt-5 pb-4" : "gap-3 px-4 pt-4 pb-3.5"
          )}
        >
          {!collapsed && (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-green">
                <span className="text-[11px] font-bold leading-none text-white">W</span>
              </div>
              <span className="font-display text-sm font-medium leading-tight tracking-tight text-gray-900 whitespace-normal">
                WhachatCRM
              </span>
            </div>
          )}

          {collapsed && (
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-green">
              <span className="text-[11px] font-bold leading-none text-white">W</span>
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleSidebar}
                data-testid="button-toggle-sidebar"
                className={cn(
                  "mt-0 shrink-0 flex items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700",
                  collapsed ? "h-8 w-8" : "h-7 w-7"
                )}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} className={sidebarTooltipClass}>
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Trial pill — desktop sidebar only; mobile uses absolute cluster in AppLayout main */}
        <div
          className={cn(
            "hidden md:flex flex-shrink-0 overflow-hidden transition-all duration-200 ease-in-out",
            collapsed ? "w-full justify-center px-0 pb-2" : "min-w-0 px-2 pb-2",
          )}
        >
          <TrialSetupCluster sidebarCollapsed={collapsed} />
        </div>

        {/* ── Navigation ── */}
        {collapsed ? (
          /* COLLAPSED: icon-only list */
          <nav className="flex-1 flex flex-col items-center gap-1 px-2 overflow-y-auto py-2">
            {allItems.map((item) => {
              const isActive = item.active;
              const iconClasses = cn(
                "h-5 w-5",
                isActive ? "text-gray-900" : "text-gray-400"
              );
              const btnClasses = cn(
                "w-10 h-10 flex items-center justify-center rounded-lg transition-colors border-s border-s-transparent",
                isActive
                  ? "border-s-gray-300 bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              );

              const inner = (
                <span className="relative inline-flex">
                  <item.icon className={iconClasses} />
                  {item.href === "/app/inbox" ? (
                    <InboxActivityNavBadge testId="sidebar-inbox-activity-badge" />
                  ) : null}
                </span>
              );

              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={item.testId}
                        className={btnClasses}
                      >
                        {inner}
                      </a>
                    ) : (
                      <Link href={item.href}>
                        <a data-testid={item.testId} className={btnClasses}>
                          {inner}
                        </a>
                      </Link>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side={tooltipSide} className={sidebarTooltipClass}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        ) : (
          /* EXPANDED: categories + labels */
          <nav className="flex-1 flex flex-col gap-4 px-4 overflow-y-auto">
            {categories.map((category) => {
              const isCategoryCollapsed = collapsedCategories.includes(category.id);
              return (
                <div key={category.id} className="flex flex-col gap-1">
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors w-full"
                    data-testid={`sidebar-section-${category.id}`}
                  >
                    {category.label}
                    {isCategoryCollapsed ? (
                      <ChevronRight className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {!isCategoryCollapsed && (
                    <div className="flex flex-col gap-1">
                      {category.items.map((item) => {
                        const isActive = item.active && item.id !== "ecommerceGrowthEngine";
                        const linkClasses = cn(
                          "flex items-center p-2 rounded-lg transition-colors group relative w-full border-s border-s-transparent",
                          isActive
                            ? "border-s-gray-300 bg-gray-100 font-medium text-gray-900"
                            : "text-gray-600 hover:bg-gray-100/90 hover:text-gray-900"
                        );
                        const iconClasses = cn(
                          "h-5 w-5 shrink-0",
                          isActive
                            ? "text-gray-900"
                            : "text-gray-400 group-hover:text-gray-600"
                        );

                        if (item.external) {
                          return (
                            <a
                              key={item.id}
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={item.testId}
                              className={linkClasses}
                            >
                              <item.icon className={iconClasses} />
                              <span
                                className={cn(
                                  "text-sm ms-3",
                                  isActive ? "font-medium" : "font-normal"
                                )}
                              >
                                {item.label}
                              </span>
                            </a>
                          );
                        }

                        return (
                          <div key={item.id}>
                          <div className="flex items-center">
                          <Link href={item.href}>
                            <a data-testid={item.testId} className={cn(linkClasses, item.id === "ecommerceGrowthEngine" && "min-w-0 flex-1")}>
                              <span className="relative inline-flex shrink-0">
                                <item.icon className={iconClasses} />
                                {item.href === "/app/inbox" ? (
                                  <InboxActivityNavBadge testId="sidebar-inbox-activity-badge" />
                                ) : null}
                              </span>
                              <span
                                className={cn(
                                  "text-sm ms-3",
                                  isActive ? "font-medium" : "font-normal"
                                )}
                              >
                                {item.label}
                              </span>
                            </a>
                          </Link>
                          {item.id === "ecommerceGrowthEngine" && (
                            <button type="button"
                              data-testid="ecommerce-sidebar-toggle"
                              aria-label={commerceExpanded ? "Collapse E-Commerce modules" : "Expand E-Commerce modules"}
                              aria-expanded={commerceExpanded}
                              onClick={() => setCommerceExpanded(v => !v)}
                              className="shrink-0 rounded-md p-1 text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                              {commerceExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                          </div>
                          {item.id === "ecommerceGrowthEngine" && commerceExpanded && (
                            <div className="ms-4 border-s border-slate-200 ps-3" data-testid="ecommerce-sidebar-modules">
                              {commerceSubnav.map(module => {
                                const isSelected = item.active && selectedCommerceView === module.id;
                                return (
                                  <Link key={module.id} href={module.href}>
                                    <a data-testid={`ecommerce-sidebar-${module.id}`}
                                      aria-current={isSelected ? "page" : undefined}
                                      className={cn("block rounded-md px-2 py-1.5 text-xs transition-colors",
                                        isSelected ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600 hover:text-blue-700 hover:bg-slate-100")}>
                                      {isRTL ? module.he : commerceLocale === "es" ? module.es : module.en}
                                    </a>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                          </div>
                        );
                      })}

                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* ── Bottom: user / logout ── */}
        <div
          className={cn(
            "mt-auto pt-3 border-t flex-shrink-0",
            collapsed ? "w-full flex flex-col items-center gap-1 px-2 pb-3" : "px-4 pb-3"
          )}
        >
          {!collapsed && user && (
            <div className="mb-1 px-2">
              <div className="text-[10px] font-medium text-gray-400">{t("common.signedInAs", "Signed in as")}</div>
              <div className="text-xs font-medium text-gray-700 truncate">{user.name}</div>
            </div>
          )}

          {!collapsed && (
            <div className="mb-2 px-2">
              <LanguageSelector variant="default" className="w-full justify-start" />
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                data-testid="button-logout"
                className={cn(
                  "flex items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors",
                  collapsed
                    ? "w-10 h-10 justify-center"
                    : "w-full p-2"
                )}
              >
                <LogOut className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <span className="font-medium ms-3">{t("common.logout", "Logout")}</span>
                )}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side={tooltipSide} className={sidebarTooltipClass}>
                {t("common.logout", "Logout")}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
