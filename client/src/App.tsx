import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Welcome } from "@/pages/Welcome";
import { Connect } from "@/pages/Connect";
import { AppLayout } from "@/pages/AppLayout";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/connect" component={Connect} />
      
      {/* Nested routes for app handled inside AppLayout mostly, but wouter needs the parent route matching */}
      <Route path="/app/:rest*" component={AppLayout} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Router />
    </QueryClientProvider>
  );
}

export default App;
