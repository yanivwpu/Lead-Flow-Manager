import { Link } from "wouter";
import { Clock, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import * as storage from "@/lib/storage";
import { useState, useEffect } from "react";
import { Chat } from "@/lib/data";

export function FollowUps() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  
  useEffect(() => {
    if (user) {
      setChats(storage.getUserChats(user.id));
    }
  }, [user]);

  const followUps = chats.filter(c => c.followUp);

  return (
    <div className="flex-1 h-full bg-white flex flex-col">
       <div className="p-8 pb-4 border-b border-gray-100">
         <h1 className="text-3xl font-display font-bold text-gray-900">Tasks</h1>
         <p className="text-gray-500 mt-1">You have {followUps.length} follow-ups scheduled.</p>
       </div>

       <div className="flex-1 overflow-y-auto p-8">
         <div className="max-w-3xl">
           <div className="mb-8">
             <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Today</h2>
             <div className="space-y-3">
               {followUps.map(chat => (
                 <div key={chat.id} className="group bg-white border border-gray-200 rounded-xl p-4 flex items-center hover:shadow-md transition-all hover:border-brand-green/30">
                   <button className="h-6 w-6 rounded-full border-2 border-gray-300 hover:border-brand-green hover:bg-green-50 mr-4 shrink-0 transition-colors" />
                   
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2 mb-1">
                       <span className="font-semibold text-gray-900">Follow up with {chat.name}</span>
                       <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                         {chat.followUp}
                       </span>
                     </div>
                     <p className="text-sm text-gray-500 truncate">
                        Last message: "{chat.lastMessage}"
                     </p>
                   </div>

                   <Link href={`/app/chats/${chat.id}`}>
                     <button className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-brand-green transition-all">
                       <ArrowRight className="h-5 w-5" />
                     </button>
                   </Link>
                 </div>
               ))}
               
               {followUps.length === 0 && (
                 <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                   <CheckCircle2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                   <p className="text-gray-500 font-medium">All caught up!</p>
                   <p className="text-sm text-gray-400">No tasks pending for today.</p>
                 </div>
               )}
             </div>
           </div>
         </div>
       </div>
    </div>
  );
}
