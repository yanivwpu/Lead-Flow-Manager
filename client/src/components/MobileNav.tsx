import { Link, useLocation } from "wouter";
import { Inbox, MessageSquare, ListTodo, Settings, Menu } from "lucide-react";
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

const mainNavItems = [
  { icon: Inbox, label: "Inbox", href: "/app/inbox", testId: "mobile-nav-inbox" },
  { icon: MessageSquare, label: "Chats", href: "/app/chats", testId: "mobile-nav-chats" },
  { icon: ListTodo, label: "Follow-ups", href: "/app/followups", testId: "mobile-nav-followups" },
  { icon: Settings, label: "Settings", href: "/app/settings", testId: "mobile-nav-settings" },
];

const moreNavItems = [
  { label: "Chatbot", href: "/app/chatbot" },
  { label: "Automation", href: "/app/workflows" },
  { label: "Templates", href: "/app/templates" },
  { label: "Website Widget", href: "/app/widget" },
  { label: "Integrations", href: "/app/integrations" },
  { label: "AI Features", href: "/app/ai-brain" },
  { label: "Search", href: "/app/search" },
  { label: "Help", href: "/app/help" },
];

export function MobileNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { logout, user } = useAuth();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
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
              <span className="text-[10px] mt-0.5 font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-brand-green flex items-center justify-center text-white text-sm font-bold">
                  C
                </div>
                <span className="font-display text-brand-teal">ChatCRM</span>
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 mt-4 pb-4">
              {moreNavItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <a
                    onClick={() => setOpen(false)}
                    data-testid={`mobile-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
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
                  Settings
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
                Logout
              </button>
            </div>
            {user && (
              <div className="border-t pt-3 pb-2 text-center text-xs text-gray-500">
                Signed in as <span className="font-medium text-gray-700">{user.name}</span>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
