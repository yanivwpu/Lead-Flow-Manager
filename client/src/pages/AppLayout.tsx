import { Switch, Route, useRoute } from "wouter";
import { Sidebar } from "@/components/Sidebar";
import { Chats } from "./Chats";
import { FollowUps } from "./FollowUps";
import { Search } from "./Search";
import { cn } from "@/lib/utils";

export function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-white md:m-3 md:rounded-2xl md:shadow-sm border-gray-200 md:border overflow-hidden relative">
         <Switch>
           <Route path="/app/chats/:id?" component={Chats} />
           <Route path="/app/followups" component={FollowUps} />
           <Route path="/app/search" component={Search} />
         </Switch>
      </main>
    </div>
  );
}
