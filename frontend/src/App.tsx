import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";

import { useAuth } from "./lib/auth";
import { LoadingBlock } from "./components/ui";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Invite from "./pages/Invite";
import Onboarding from "./pages/Onboarding";
const AppShell = lazy(() => import("./components/AppShell"));
const AppHome = lazy(() => import("./pages/app/Home"));
const LibraryPage = lazy(() => import("./pages/app/Library"));
const LibrarySettings = lazy(() => import("./pages/app/LibrarySettings"));
const VideoPage = lazy(() => import("./pages/app/Video"));
const Usage = lazy(() => import("./pages/app/Usage"));
const Team = lazy(() => import("./pages/app/Team"));
const ApiKeys = lazy(() => import("./pages/app/ApiKeys"));
const Billing = lazy(() => import("./pages/app/Billing"));
const InvoicePage = lazy(() => import("./pages/app/Invoice"));
const OrgSettings = lazy(() => import("./pages/app/OrgSettings"));
const AdminShell = lazy(() => import("./pages/admin/AdminShell"));
const AdminOverview = lazy(() => import("./pages/admin/Overview"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers"));
const AdminPlans = lazy(() => import("./pages/admin/Plans"));
const AdminInvoices = lazy(() => import("./pages/admin/Invoices"));
const AdminCosts = lazy(() => import("./pages/admin/Costs"));
const AdminEncoder = lazy(() => import("./pages/admin/Encoder"));

function RequireAuth({ children, staff }: { children: ReactNode; staff?: boolean }) {
  const { ready, me } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingBlock />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (staff && !me.user.is_staff) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function RequireOrg({ children }: { children: ReactNode }) {
  const { membership } = useAuth();
  if (!membership) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingBlock />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><RequireOrg><AppShell /></RequireOrg></RequireAuth>}>
        <Route index element={<AppHome />} />
        <Route path="libraries/:id" element={<LibraryPage />} />
        <Route path="libraries/:id/settings" element={<LibrarySettings />} />
        <Route path="videos/:id" element={<VideoPage />} />
        <Route path="usage" element={<Usage />} />
        <Route path="team" element={<Team />} />
        <Route path="api-keys" element={<ApiKeys />} />
        <Route path="billing" element={<Billing />} />
        <Route path="billing/invoices/:id" element={<InvoicePage />} />
        <Route path="settings" element={<OrgSettings />} />
      </Route>
      <Route path="/admin" element={<RequireAuth staff><AdminShell /></RequireAuth>}>
        <Route index element={<AdminOverview />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="invoices" element={<AdminInvoices />} />
        <Route path="costs" element={<AdminCosts />} />
        <Route path="encoder" element={<AdminEncoder />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
