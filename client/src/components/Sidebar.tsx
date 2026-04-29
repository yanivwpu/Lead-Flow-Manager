import { Link, useLocation } from "wouter";
import {
  ListTodo,
  Search,
  LogOut,
  Settings,
  Zap,
  Plug,
  FileText,
  HelpCircle,
  Bot,
  Inbox,
  Globe,
  Brain,
  ChevronDown,
  ChevronRight,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "./LanguageSelector";
import { getDirection } from "@/lib/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const isRTL = getDirection() === "rtl";

  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);

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

  const navCategories = [
    {
      label: t("nav.main", "Main"),
      items: [
        { icon: Inbox, label: t("nav.inbox", "Inbox"), href: "/app/inbox", testId: "sidebar-inbox" },
        { icon: ListTodo, label: t("nav.followups", "Follow-ups"), href: "/app/followups", testId: "sidebar-followups" },
        { icon: Users, label: t("nav.contacts", "Contacts"), href: "/app/contacts", testId: "sidebar-contacts" },
      ],
    },
    {
      label: t("nav.automationAi", "Automation & AI"),
      items: [
        { icon: Bot, label: t("nav.chatbot", "Flow Builder"), href: "/app/chatbot", testId: "sidebar-chatbot" },
        { icon: Zap, label: t("nav.automations", "Automations"), href: "/app/workflows", testId: "sidebar-automation" },
        { icon: Brain, label: t("nav.aiBrain", "AI Features"), href: "/app/ai-brain", testId: "sidebar-ai-brain" },
      ],
    },
    {
      label: t("nav.toolsSetup", "Tools & Setup"),
      items: [
        { icon: FileText, label: t("nav.templates", "Templates"), href: "/app/templates", testId: "sidebar-templates" },
        { icon: Globe, label: t("nav.widget", "Website Widget"), href: "/app/widget", testId: "sidebar-widget" },
        { icon: Plug, label: t("nav.integrations", "Integrations"), href: "/app/integrations", testId: "sidebar-integrations" },
        { icon: Search, label: t("common.search", "Search"), href: "/app/search", testId: "sidebar-search" },
      ],
    },
    {
      label: t("nav.support", "Support"),
      items: [
        { icon: Settings, label: t("nav.settings", "Settings"), href: "/app/settings", testId: "sidebar-settings" },
        { icon: BookOpen, label: t("nav.gettingStarted", "Getting Started"), href: "/WhachatCRM-User-Guide.html", testId: "sidebar-getting-started", external: true },
        { icon: HelpCircle, label: t("nav.help", "Help"), href: "/app/help", testId: "sidebar-help" },
      ],
    },
  ];

  const allNavItems = navCategories.flatMap((c) => c.items);
  const tooltipSide = isRTL ? "left" : "right";
  const sidebarTooltipClass =
    "border border-gray-200/90 bg-gray-100 text-gray-700 text-[11px] leading-snug shadow-none px-2.5 py-1.5 font-normal";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "hidden md:flex h-full flex-col bg-gray-50 z-20 transition-all duration-200 ease-in-out flex-shrink-0",
          isRTL ? "border-is" : "border-ie",
          collapsed ? "w-16 items-center" : "w-[200px] items-stretch"
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

        {/* ── Navigation ── */}
        {collapsed ? (
          /* COLLAPSED: icon-only list */
          <nav className="flex-1 flex flex-col items-center gap-1 px-2 overflow-y-auto py-2">
            {allNavItems.map((item: any) => {
              const isActive = !item.external && location.startsWith(item.href);
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

              const inner = <item.icon className={iconClasses} />;

              return (
                <Tooltip key={item.href}>
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
            {navCategories.map((category) => {
              const isCategoryCollapsed = collapsedCategories.includes(category.label);
              return (
                <div key={category.label} className="flex flex-col gap-1">
                  <button
                    onClick={() => toggleCategory(category.label)}
                    className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors w-full"
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
                      {category.items.map((item: any) => {
                        const isActive = !item.external && location.startsWith(item.href);
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
                              key={item.href}
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
                          <Link key={item.href} href={item.href}>
                            <a data-testid={item.testId} className={linkClasses}>
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
                          </Link>
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
              <div className="text-[10px] font-medium text-gray-400">Signed in as</div>
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
