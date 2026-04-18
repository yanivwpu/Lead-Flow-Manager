import { Link, useLocation } from "wouter";
import { Inbox, ListTodo, Users, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";

export function MobileNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const isRTL = getDirection() === 'rtl';

  const mainNavItems = [
    { icon: Inbox, label: t('nav.inbox', 'Inbox'), href: "/app/inbox", testId: "mobile-nav-inbox" },
    { icon: ListTodo, label: t('nav.followUps', 'Follow-ups'), href: "/app/followups", testId: "mobile-nav-followups" },
    { icon: Users, label: t('nav.contacts', 'Contacts'), href: "/app/contacts", testId: "mobile-nav-contacts" },
  ];

  const moreNavItems = [
    { label: t('nav.chatbot', 'Flow Builder'), href: "/app/chatbot", testId: "chatbot" },
    { label: t('nav.automation', 'Automation'), href: "/app/workflows", testId: "automation" },
    { label: t('nav.templates', 'Templates'), href: "/app/templates", testId: "templates" },
    { label: t('nav.websiteWidget', 'Website Widget'), href: "/app/widget", testId: "website-widget" },
    { label: t('nav.integrations', 'Integrations'), href: "/app/integrations", testId: "integrations" },
    { label: t('nav.aiFeatures', 'AI Features'), href: "/app/ai-brain", testId: "ai-features" },
    { label: t('nav.search', 'Search'), href: "/app/search", testId: "search" },
    { label: t('nav.gettingStarted', 'Getting Started'), href: "/WhachatCRM-User-Guide.html", testId: "getting-started", external: true },
    { label: t('nav.help', 'Help'), href: "/app/help", testId: "help" },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom" dir={isRTL ? 'rtl' : 'ltr'}>
      <nav className="flex items-center justify-around h-14 px-2">
        {mainNavItems.slice(0, 3).map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <a
                data-testid={item.testId}
                className={cn(
                  "flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors",
                  isActive ? "text-brand-green" : "text-gray-500"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] mt-0.5 font-medium">{item.label}</span>
              </a>
            </Link>
          );
        })}
        
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              data-testid="mobile-nav-more"
              className="flex flex-col items-center justify-center px-3 py-1 rounded-lg text-gray-500"
            >
              <Menu className="h-5 w-5" />
              <span className="text-[10px] mt-0.5 font-medium">{t('nav.more', 'More')}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <div className="h-5 w-5 bg-brand-green rounded-md flex items-center justify-center">
                  <span className="text-white font-bold text-xs">W</span>
                </div>
                <span className="font-display text-gray-900">WhachatCRM</span>
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 mt-4 pb-4">
              {moreNavItems.map((item: any) => (
                item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    data-testid={`mobile-menu-${item.testId}`}
                    className="block p-3 rounded-lg text-center font-medium transition-colors bg-gray-50 text-gray-700 hover:bg-gray-100"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link key={item.href} href={item.href}>
                    <a
                      onClick={() => setOpen(false)}
                      data-testid={`mobile-menu-${item.testId}`}
                      className={cn(
                        "block p-3 rounded-lg text-center font-medium transition-colors",
                        location.startsWith(item.href)
                          ? "bg-brand-green/10 text-brand-green"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                      )}
                    >
                      {item.label}
                    </a>
                  </Link>
                )
              ))}
              <Link href="/app/settings">
                <a
                  onClick={() => setOpen(false)}
                  data-testid="mobile-menu-settings"
                  className={cn(
                    "block p-3 rounded-lg text-center font-medium transition-colors",
                    location.startsWith("/app/settings")
                      ? "bg-brand-green/10 text-brand-green"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  )}
                >
                  {t('nav.settings', 'Settings')}
                </a>
              </Link>
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                data-testid="mobile-menu-logout"
                className="block p-3 rounded-lg text-center font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                {t('common.logout', 'Logout')}
              </button>
            </div>
            {user && (
              <div className="border-t pt-3 pb-2 text-center text-xs text-gray-500">
                {t('common.signedInAs', 'Signed in as')} <span className="font-medium text-gray-700">{user.name}</span>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
