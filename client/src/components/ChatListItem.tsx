import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { TAG_COLORS } from "@/lib/data";
import { CheckCheck } from "lucide-react";

interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  tag: string;
  followUp: string | null;
  messages: any[];
}

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
}

export function ChatListItem({ chat, isActive }: ChatListItemProps) {
  const lastMessage = chat.messages && chat.messages.length > 0 
    ? chat.messages[chat.messages.length - 1] 
    : null;
  const isLastMessageFromMe = lastMessage?.sender === 'me';

  return (
    <Link href={`/app/chats/${chat.id}`}>
      <div
        className={cn(
          "flex items-center p-3 cursor-pointer transition-colors border-b border-gray-50 hover:bg-gray-50",
          isActive ? "bg-gray-100 hover:bg-gray-100" : "bg-white"
        )}
        data-testid={`chat-item-${chat.id}`}
      >
        <div className="relative shrink-0">
          <div className="h-12 w-12 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green font-semibold">
            {chat.avatar}
          </div>
          {chat.unread > 0 && (
            <div className="absolute -top-1 -right-1 h-5 w-5 bg-brand-green text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white">
              {chat.unread}
            </div>
          )}
        </div>

        <div className="ml-3 flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{chat.name}</h3>
            <span
              className={cn(
                "text-xs whitespace-nowrap",
                chat.unread > 0 ? "text-brand-green font-medium" : "text-gray-400"
              )}
            >
              {chat.time}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center text-sm text-gray-500 truncate pr-2">
              {isLastMessageFromMe && (
                <span className="mr-1">
                   <CheckCheck className="h-4 w-4 text-blue-400" />
                </span>
              )}
              <span className="truncate">{chat.lastMessage}</span>
            </div>
          </div>
          
          <div className="flex gap-2 mt-2">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", TAG_COLORS[chat.tag as keyof typeof TAG_COLORS] || "bg-gray-50 text-gray-600 border-gray-200")}>
              {chat.tag}
            </span>
            {chat.followUp && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-600 border-red-100 font-medium flex items-center">
                 Due {chat.followUp}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
