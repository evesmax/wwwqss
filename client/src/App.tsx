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
import QNexusControlPage from "@/pages/QNexusControlPage";
import QCampusOnePage from "@/pages/QCampusOnePage";
import QNexusAppPage from "@/pages/QNexusAppPage";
import HolaKuraPage from "@/pages/HolaKuraPage";
import AuranubaPage from "@/pages/AuranubaPage";
import AdminApp from "@/pages/admin/AdminApp";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/qfood" component={QFoodControlPage} />
      <Route path="/qinventia" component={QInventiaControlPage} />
      <Route path="/qprofessional" component={QProfessionalServicesPage} />
      <Route path="/productos/qnexus-control" component={QNexusControlPage} />
      <Route path="/productos/qcampus-one" component={QCampusOnePage} />
      <Route path="/productos/qnexus-app" component={QNexusAppPage} />
      <Route path="/productos/holakura" component={HolaKuraPage} />
      <Route path="/productos/auranuba" component={AuranubaPage} />
      <Route path="/admin/:rest*" component={AdminApp} />
      <Route path="/admin" component={AdminApp} />
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
