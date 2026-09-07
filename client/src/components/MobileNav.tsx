import { Link } from "wouter";
import { Menu } from "lucide-react";
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
import { InboxActivityNavBadge } from "@/components/InboxActivityNavBadge";
import { useAppNavCategories } from "@/lib/useAppNav";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const isRTL = getDirection() === "rtl";
  const { mobilePrimaryItems, mobileMoreCategories } = useAppNavCategories();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom" dir={isRTL ? "rtl" : "ltr"}>
      <nav className="flex items-center justify-around h-14 px-2">
        {mobilePrimaryItems.map((item) => {
          return (
            <Link key={item.id} href={item.href}>
              <a
                data-testid={`mobile-nav-${item.mobileTestId}`}
                className={cn(
                  "flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors",
                  item.active ? "text-brand-green" : "text-gray-500"
                )}
              >
                <span className="relative inline-flex">
                  <item.icon className="h-5 w-5" />
                  {item.id === "inbox" ? (
                    <InboxActivityNavBadge testId="mobile-nav-inbox-activity-badge" />
                  ) : null}
                </span>
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
              <span className="text-[10px] mt-0.5 font-medium">{t("nav.more", "More")}</span>
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
            <div className="mt-4 pb-4 space-y-4">
              {mobileMoreCategories.map((category) => (
                <div key={category.id} data-testid={`mobile-section-${category.id}`}>
                  <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {category.label}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {category.items.map((item) =>
                      item.external ? (
                        <a
                          key={item.id}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setOpen(false)}
                          data-testid={`mobile-menu-${item.mobileTestId}`}
                          className="block p-3 rounded-lg text-center font-medium transition-colors bg-gray-50 text-gray-700 hover:bg-gray-100"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link key={item.id} href={item.href}>
                          <a
                            onClick={() => setOpen(false)}
                            data-testid={`mobile-menu-${item.mobileTestId}`}
                            className={cn(
                              "block p-3 rounded-lg text-center font-medium transition-colors",
                              item.active
                                ? "bg-brand-green/10 text-brand-green"
                                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                            )}
                          >
                            {item.label}
                          </a>
                        </Link>
                      )
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                data-testid="mobile-menu-logout"
                className="block w-full p-3 rounded-lg text-center font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                {t("common.logout", "Logout")}
              </button>
            </div>
            {user && (
              <div className="border-t pt-3 pb-2 text-center text-xs text-gray-500">
                {t("common.signedInAs", "Signed in as")}{" "}
                <span className="font-medium text-gray-700">{user.name}</span>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
