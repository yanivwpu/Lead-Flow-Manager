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
import { useState, type ReactNode } from "react";
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

const sidebarMotion = "duration-[225ms] ease-in-out motion-reduce:transition-none";

// Keep section content mounted while its height changes with the sidebar.
function SidebarSection({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <div
      inert={!visible}
      className={cn(
        "grid transition-[grid-template-rows,opacity]",
        sidebarMotion,
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function Sidebar() {
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const isRTL = getDirection() === "rtl";
  const { categories } = useAppNavCategories();
  const commerceSearch = useSearch();
  const commerceViewParam = new URLSearchParams(commerceSearch).get("view");
  const selectedCommerceView = ["products", "orders", "shopping", "recovery", "post", "settings", "guide"].includes(commerceViewParam || "") ? commerceViewParam : "overview";
  const commerceSubnav = [
    {id:"guide", en:"User Guide", es:"Guía de uso", he:"מדריך שימוש", href:"/app/ecommerce-growth-engine?view=guide"},
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
          "hidden md:flex h-full min-w-0 shrink-0 flex-col overflow-hidden border-[#27313b] bg-[#0f1720] text-slate-50 z-20 transition-[width]",
          "[&_:is(a,button):focus-visible]:outline [&_:is(a,button):focus-visible]:outline-2 [&_:is(a,button):focus-visible]:-outline-offset-2 [&_:is(a,button):focus-visible]:outline-emerald-300",
          sidebarMotion,
          isRTL ? "border-is" : "border-ie",
          collapsed ? "w-16" : "w-[200px]",
        )}
        data-testid="sidebar"
      >
        <div
          className={cn(
            "relative shrink-0 transition-[height]",
            sidebarMotion,
            collapsed ? "h-[78px]" : "h-14",
          )}
        >
          <div className="absolute start-[21px] end-12 top-[18px] flex min-w-0 items-center gap-1.5">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-green">
              <span className="text-[11px] font-bold leading-none text-white">W</span>
            </div>
            <span className={cn(
              "truncate font-display text-sm font-medium leading-tight tracking-tight text-slate-50 transition-opacity",
              sidebarMotion,
              collapsed && "opacity-0",
            )}>
              WhachatCRM
            </span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                data-testid="button-toggle-sidebar"
                className={cn(
                  "absolute end-[15px] flex h-8 w-8 items-center justify-center rounded-md text-slate-50 transition-[top,background-color,color] hover:bg-[#202b35] hover:text-white",
                  sidebarMotion,
                  collapsed ? "top-10" : "top-3",
                )}
                aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
                aria-expanded={!collapsed}
                aria-controls="desktop-sidebar-navigation"
              >
                {collapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} className={sidebarTooltipClass}>
              {collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="shrink-0 px-3 pb-2">
          <TrialSetupCluster sidebarCollapsed={collapsed} />
        </div>

        <nav id="desktop-sidebar-navigation" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 overscroll-contain [scrollbar-width:thin] [scrollbar-gutter:stable]">
          {categories.map((category) => {
            const isCategoryCollapsed = collapsedCategories.includes(category.id);
            return (
              <div key={category.id}>
                <SidebarSection visible={!collapsed}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    aria-expanded={!isCategoryCollapsed}
                    className="flex w-full items-center justify-between gap-2 px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-white"
                    data-testid={`sidebar-section-${category.id}`}
                  >
                    <span className="truncate">{category.label}</span>
                    {isCategoryCollapsed ? <ChevronRight className="h-3 w-3 shrink-0 rtl:rotate-180" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                  </button>
                </SidebarSection>

                <SidebarSection visible={collapsed || !isCategoryCollapsed}>
                  {category.items.map((item) => {
                    const isCommerce = item.id === "ecommerceGrowthEngine";
                    const isActive = item.active && (collapsed || !isCommerce);
                    const linkClasses = cn(
                      "group my-0.5 flex h-10 w-full min-w-0 items-center overflow-hidden rounded-lg border-s border-s-transparent ps-[9px] pe-1 transition-colors",
                      isActive
                        ? "border-s-emerald-400 bg-[#1b3631] font-medium text-slate-50"
                        : "font-medium text-slate-50 hover:bg-[#202b35] hover:text-white",
                    );
                    const inner = (
                      <>
                        <span className="relative inline-flex shrink-0">
                          <item.icon className="h-5 w-5 text-slate-50 group-hover:text-white" />
                          {item.href === "/app/inbox" ? (
                            <InboxActivityNavBadge testId="sidebar-inbox-activity-badge" />
                          ) : null}
                        </span>
                        <span className={cn("ms-3 min-w-0 truncate text-sm transition-opacity", sidebarMotion, collapsed && "opacity-0")}>
                          {item.label}
                        </span>
                      </>
                    );

                    return (
                      <div key={item.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {item.external ? (
                              <a href={item.href} target="_blank" rel="noopener noreferrer" data-testid={item.testId}
                                aria-label={item.label} className={linkClasses}>
                                {inner}
                              </a>
                            ) : (
                              <Link href={item.href}>
                                <a data-testid={item.testId} aria-label={item.label} className={linkClasses}>{inner}</a>
                              </Link>
                            )}
                          </TooltipTrigger>
                          <TooltipContent side={tooltipSide} className={sidebarTooltipClass}>
                            {item.label}
                          </TooltipContent>
                        </Tooltip>

                        {isCommerce && (
                          <SidebarSection visible={!collapsed}>
                            <button
                              type="button"
                              data-testid="ecommerce-sidebar-toggle"
                              aria-label={commerceExpanded ? t("nav.collapseCommerce") : t("nav.expandCommerce")}
                              aria-expanded={commerceExpanded}
                              onClick={() => setCommerceExpanded(v => !v)}
                              className="ms-9 mb-1 mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold text-slate-200 hover:bg-[#202b35] hover:text-white"
                            >
                              {commerceExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" />}
                              <span>{commerceExpanded ? (isRTL ? "הסתרה" : commerceLocale === "es" ? "Ocultar" : "Hide") : (isRTL ? "הצגה" : commerceLocale === "es" ? "Mostrar" : "Show")}</span>
                            </button>
                            {commerceExpanded && (
                              <div className="ms-4 border-s border-[#34414b] ps-3" data-testid="ecommerce-sidebar-modules">
                                {commerceSubnav.map(module => {
                                  const isSelected = item.active && selectedCommerceView === module.id;
                                  return (
                                    <Link key={module.id} href={module.href}>
                                      <a data-testid={`ecommerce-sidebar-${module.id}`}
                                        aria-current={isSelected ? "page" : undefined}
                                        className={cn("block truncate rounded-md px-2 py-1.5 text-xs transition-colors",
                                          isSelected ? "bg-[#1b3631] font-semibold text-slate-50" : "text-slate-50 hover:bg-[#202b35] hover:text-white")}>
                                        {isRTL ? module.he : commerceLocale === "es" ? module.es : module.en}
                                      </a>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </SidebarSection>
                        )}
                      </div>
                    );
                  })}
                </SidebarSection>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-[#27313b] px-3 pb-3 pt-3">
          <SidebarSection visible={!collapsed}>
            <div className="w-[175px]">
              {user && (
                <div className="mb-1 px-2">
                  <div className="text-[10px] font-medium text-slate-300">{t("common.signedInAs", "Signed in as")}</div>
                  <div className="truncate text-xs font-medium text-slate-100">{user.name}</div>
                </div>
              )}
              <div className="mb-2 px-2">
                <LanguageSelector variant="default" className="w-full justify-start text-slate-50 hover:bg-[#202b35] hover:text-white" />
              </div>
            </div>
          </SidebarSection>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={logout}
                data-testid="button-logout"
                aria-label={t("common.logout", "Logout")}
                className="flex h-10 w-full items-center overflow-hidden rounded-lg ps-[10px] text-slate-50 transition-colors hover:bg-red-950 hover:text-red-100"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span className={cn("ms-3 whitespace-nowrap font-medium transition-opacity", sidebarMotion, collapsed && "opacity-0")}>
                  {t("common.logout", "Logout")}
                </span>
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
