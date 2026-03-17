import { Link, useLocation } from "wouter";
import { MessageSquare, ListTodo, Search, LogOut, Settings, Zap, Plug, FileText, HelpCircle, Bot, Inbox, Globe, Brain, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "./LanguageSelector";
import { getDirection } from "@/lib/i18n";

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const isRTL = getDirection() === 'rtl';

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category) 
        : [...prev, category]
    );
  };

  const navCategories = [
    {
      label: t('nav.main', 'Main'),
      items: [
        { icon: Inbox, label: t('nav.inbox', 'Inbox'), href: "/app/inbox", testId: "sidebar-inbox" },
        { icon: MessageSquare, label: t('nav.chats', 'Chats'), href: "/app/chats", testId: "sidebar-chats" },
        { icon: ListTodo, label: t('nav.followups', 'Follow-ups'), href: "/app/followups", testId: "sidebar-followups" },
      ]
    },
    {
      label: t('nav.automationAi', 'Automation & AI'),
      items: [
        { icon: Bot, label: t('nav.chatbot', 'Chatbot'), href: "/app/chatbot", testId: "sidebar-chatbot" },
        { icon: Zap, label: t('nav.automations', 'Automation'), href: "/app/workflows", testId: "sidebar-automation" },
        { icon: Brain, label: t('nav.aiBrain', 'AI Features'), href: "/app/ai-brain", testId: "sidebar-ai-brain" },
      ]
    },
    {
      label: t('nav.toolsSetup', 'Tools & Setup'),
      items: [
        { icon: FileText, label: t('nav.templates', 'Templates'), href: "/app/templates", testId: "sidebar-templates" },
        { icon: Globe, label: t('nav.widget', 'Website Widget'), href: "/app/widget", testId: "sidebar-widget" },
        { icon: Plug, label: t('nav.integrations', 'Integrations'), href: "/app/integrations", testId: "sidebar-integrations" },
        { icon: Search, label: t('common.search', 'Search'), href: "/app/search", testId: "sidebar-search" },
      ]
    },
    {
      label: t('nav.support', 'Support'),
      items: [
        { icon: Settings, label: t('nav.settings', 'Settings'), href: "/app/settings", testId: "sidebar-settings" },
        { icon: BookOpen, label: t('nav.gettingStarted', 'Getting Started'), href: "/WhachatCRM-User-Guide.html", testId: "sidebar-getting-started", external: true },
        { icon: HelpCircle, label: t('nav.help', 'Help'), href: "/app/help", testId: "sidebar-help" },
      ]
    }
  ];

  return (
    <div className={cn("hidden md:flex h-full w-[200px] bg-white flex-col items-stretch py-3 z-20", isRTL ? "border-is" : "border-ie")}>
      <div className="mb-4 px-6 flex items-center">
        <div className="h-6 w-6 bg-brand-green rounded-md flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">W</span>
        </div>
        <span className="font-display font-bold text-base text-gray-900 ms-2">
          WhachatCRM
        </span>
      </div>

      <nav className="flex-1 flex flex-col gap-4 px-4 overflow-y-auto">
        {navCategories.map((category) => {
          const isCollapsed = collapsedCategories.includes(category.label);
          return (
            <div key={category.label} className="flex flex-col gap-1">
              <button 
                onClick={() => toggleCategory(category.label)}
                className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors w-full"
              >
                {category.label}
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              
              {!isCollapsed && (
                <div className="flex flex-col gap-1">
                  {category.items.map((item: any) => {
                    const isActive = !item.external && location.startsWith(item.href);
                    const linkClasses = cn(
                      "flex items-center p-2 rounded-lg transition-colors group relative w-full",
                      isActive
                        ? "bg-emerald-50 text-brand-green"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    );
                    const iconClasses = cn(
                      "h-5 w-5 shrink-0",
                      isActive ? "text-brand-green" : "text-gray-400 group-hover:text-gray-600"
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
                          <span className="font-medium text-sm ms-3">{item.label}</span>
                        </a>
                      );
                    }

                    return (
                      <Link key={item.href} href={item.href}>
                        <a
                          data-testid={item.testId}
                          className={linkClasses}
                        >
                          <item.icon className={iconClasses} />
                          <span className="font-medium text-sm ms-3">{item.label}</span>
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

      <div className="mt-auto pt-3 px-4 border-t">
        {user && (
          <div className="mb-1 px-2">
            <div className="text-[10px] font-medium text-gray-400">Signed in as</div>
            <div className="text-xs font-medium text-gray-700 truncate">{user.name}</div>
          </div>
        )}
        <div className="mb-2 px-2">
          <LanguageSelector variant="default" className="w-full justify-start" />
        </div>
        <button 
          onClick={logout}
          data-testid="button-logout"
          className="w-full flex items-center p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="font-medium ms-3">{t('common.logout', 'Logout')}</span>
        </button>
      </div>
    </div>
  );
}
