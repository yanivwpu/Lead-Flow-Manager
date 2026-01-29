import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { TAG_COLORS } from "@/lib/data";
import { CheckCheck } from "lucide-react";
import { ChatAvatar } from "@/components/ChatAvatar";
import { format } from "date-fns";

interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  tag: string;
  pipelineStage: string;
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
          "flex items-center py-2 px-3 cursor-pointer transition-colors border-b border-gray-100 hover:bg-gray-50",
          isActive ? "bg-gray-100 hover:bg-gray-100" : "bg-white"
        )}
        data-testid={`chat-item-${chat.id}`}
      >
        <div className="relative shrink-0">
          <ChatAvatar src={chat.avatar} name={chat.name} size="lg" />
          {chat.unread > 0 && (
            <div className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-brand-green text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              {chat.unread}
            </div>
          )}
        </div>

        <div className="ml-2.5 flex-1 min-w-0">
          <div className="flex justify-between items-baseline">
            <h3 className="font-semibold text-gray-900 truncate text-[15px]">{chat.name}</h3>
            <span
              className={cn(
                "text-[11px] whitespace-nowrap ml-2",
                chat.unread > 0 ? "text-brand-green font-medium" : "text-gray-400"
              )}
            >
              {chat.time && !chat.time.includes('T') ? chat.time : (chat.time ? format(new Date(chat.time), 'HH:mm') : '')}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center text-[13px] text-gray-500 truncate pr-2">
              {isLastMessageFromMe && (
                <span className="mr-1">
                   <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
                </span>
              )}
              <span className="truncate">{chat.lastMessage}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1 mt-1">
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", TAG_COLORS[chat.tag as keyof typeof TAG_COLORS] || "bg-gray-50 text-gray-600 border-gray-200")}>
              {chat.tag}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-100 font-medium">
              {chat.pipelineStage}
            </span>
            {chat.followUp && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border bg-red-50 text-red-600 border-red-100 font-medium flex items-center">
                 Due {chat.followUp}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
