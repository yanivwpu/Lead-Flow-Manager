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

  const timeDisplay = chat.time && !chat.time.includes('T')
    ? chat.time
    : (chat.time ? format(new Date(chat.time), 'HH:mm') : '');

  return (
    <Link href={`/app/chats/${chat.id}`}>
      <div
        className={cn(
          "flex items-center gap-2 py-[7px] px-3 cursor-pointer transition-colors border-b border-gray-100 hover:bg-gray-50",
          isActive ? "bg-gray-100 hover:bg-gray-100" : "bg-white"
        )}
        data-testid={`chat-item-${chat.id}`}
      >
        <div className="relative shrink-0">
          <ChatAvatar src={chat.avatar} name={chat.name} size="sm" />
          {chat.unread > 0 && (
            <div className="absolute -top-0.5 -right-0.5 h-[14px] w-[14px] bg-brand-green text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
              {chat.unread}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline gap-1">
            <h3 className="font-medium text-gray-900 truncate text-[13.5px] leading-tight">{chat.name}</h3>
            <span
              className={cn(
                "text-[10px] whitespace-nowrap shrink-0 leading-tight",
                chat.unread > 0 ? "text-brand-green font-medium" : "text-gray-400"
              )}
            >
              {timeDisplay}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1 mt-[2px]">
            <div className="flex items-center text-[11.5px] text-gray-500 truncate min-w-0 leading-tight">
              {isLastMessageFromMe && (
                <CheckCheck className="h-3 w-3 text-blue-400 shrink-0 mr-0.5" />
              )}
              <span className="truncate">{chat.lastMessage}</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {chat.tag && (
                <span className={cn(
                  "text-[9px] px-1 py-px rounded border leading-none",
                  TAG_COLORS[chat.tag] || "bg-gray-50 text-gray-500 border-gray-200"
                )}>
                  {chat.tag}
                </span>
              )}
              {chat.followUp && (
                <span className="text-[9px] px-1 py-px rounded border bg-red-50 text-red-500 border-red-100 leading-none">
                  Due
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
