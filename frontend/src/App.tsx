import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout";
import { Skeleton, ToastProvider } from "./components/ui";
import { WorkspaceProvider } from "./context/workspace";

const OverviewPage = lazy(() => import("./pages/Overview"));
const EventsPage = lazy(() => import("./pages/Events"));
const EventDetailPage = lazy(() => import("./pages/EventDetail"));
const SessionsPage = lazy(() => import("./pages/Sessions"));
const SessionDetailPage = lazy(() => import("./pages/SessionDetail"));
const ApprovalsPage = lazy(() => import("./pages/Approvals"));
const PoliciesPage = lazy(() => import("./pages/Policies"));
const ProjectsPage = lazy(() => import("./pages/Projects"));
const ApiKeysPage = lazy(() => import("./pages/ApiKeys"));
const EvaluationPage = lazy(() => import("./pages/Evaluation"));
const AlertsPage = lazy(() => import("./pages/Alerts"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const DemoAssistantPage = lazy(() => import("./pages/DemoAssistant"));
const NotFoundPage = lazy(() => import("./pages/NotFound"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function RouteFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-72 xl:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <ScrollToTop />
        <AppShell>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/policies" element={<PoliciesPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/keys" element={<ApiKeysPage />} />
              <Route path="/evaluation" element={<EvaluationPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/demo" element={<DemoAssistantPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AppShell>
      </WorkspaceProvider>
    </ToastProvider>
  );
}
