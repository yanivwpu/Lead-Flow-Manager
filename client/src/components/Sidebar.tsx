import { Link, useLocation } from "wouter";
import { MessageSquare, ListTodo, Search, LogOut, Settings, Zap, Plug, FileText, HelpCircle, Bot, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  const navItems = [
    { icon: Inbox, label: "Inbox", href: "/app/inbox", testId: "sidebar-inbox" },
    { icon: MessageSquare, label: "Chats", href: "/app/chats", testId: "sidebar-chats" },
    { icon: ListTodo, label: "Follow-ups", href: "/app/followups", testId: "sidebar-followups" },
    { icon: Bot, label: "Chatbot", href: "/app/chatbot", testId: "sidebar-chatbot" },
    { icon: Zap, label: "Automation", href: "/app/workflows", testId: "sidebar-automation" },
    { icon: FileText, label: "Templates", href: "/app/templates", testId: "sidebar-templates" },
    { icon: Plug, label: "Integrations", href: "/app/integrations", testId: "sidebar-integrations" },
    { icon: Search, label: "Search", href: "/app/search", testId: "sidebar-search" },
    { icon: Settings, label: "Settings", href: "/app/settings", testId: "sidebar-settings" },
    { icon: HelpCircle, label: "Help", href: "/app/help", testId: "sidebar-help" },
  ];

  return (
    <div className="h-full w-[60px] md:w-[240px] bg-white border-r flex flex-col items-center md:items-stretch py-3 z-20">
      <div className="mb-4 px-0 md:px-6 flex items-center justify-center md:justify-start">
        <div className="h-8 w-8 rounded-full bg-brand-green flex items-center justify-center text-white font-bold shrink-0">
          C
        </div>
        <span className="ml-3 font-display font-bold text-xl hidden md:block text-brand-teal">
          ChatCRM
        </span>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-2 md:px-4">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <a
                data-testid={item.testId}
                className={cn(
                  "flex items-center p-2 rounded-lg transition-colors group relative md:w-full justify-center md:justify-start",
                  isActive
                    ? "bg-emerald-50 text-brand-green"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive ? "text-brand-green" : "text-gray-400 group-hover:text-gray-600"
                  )}
                />
                <span className="ml-3 font-medium hidden md:block">{item.label}</span>
                {isActive && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-brand-green rounded-r-full md:hidden" />
                )}
              </a>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-3 px-2 md:px-4">
        {user && (
          <div className="mb-1 px-2 hidden md:block">
            <div className="text-[10px] font-medium text-gray-400">Signed in as</div>
            <div className="text-xs font-medium text-gray-700 truncate">{user.name}</div>
          </div>
        )}
        <button 
          onClick={logout}
          className="w-full flex items-center p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors justify-center md:justify-start"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="ml-3 font-medium hidden md:block">Logout</span>
        </button>
      </div>
    </div>
  );
}
