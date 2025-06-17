import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import QFoodControlPage from "@/pages/QFoodControlPage";
import QInventiaControlPage from "@/pages/QInventiaControlPage";
import QProfessionalServicesPage from "@/pages/QProfessionalServicesPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/qfood" component={QFoodControlPage} />
      <Route path="/qinventia" component={QInventiaControlPage} />
      <Route path="/qprofessional" component={QProfessionalServicesPage} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
