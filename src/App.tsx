import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/features/auth/AuthContext";
import { RequireAuth, RequirePermission } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { InternalUserListPage } from "@/features/internal-users/InternalUserListPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { BuildingListPage } from "@/features/buildings/BuildingListPage";
import { CreateBuildingPage } from "@/features/buildings/CreateBuildingPage";
import { BuildingDetailPage } from "@/features/buildings/BuildingDetailPage";
import { FloorDetailPage } from "@/features/floors/FloorDetailPage";
import { BeaconListPage } from "@/features/beacons/BeaconListPage";
import { SessionListPage } from "@/features/fingerprinting/SessionListPage";
import { SessionDetailPage } from "@/features/fingerprinting/SessionDetailPage";
import { PoiDetailPage } from "@/features/pois/PoiDetailPage";
import { LiveMapPage } from "@/features/live/LiveMapPage";
import { AnalyticsPage } from "@/features/live/AnalyticsPage";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/buildings" element={<BuildingListPage />} />
                <Route path="/buildings/new" element={<CreateBuildingPage />} />
                <Route path="/buildings/:buildingId" element={<BuildingDetailPage />} />
                <Route
                  path="/buildings/:buildingId/floors/:floorId"
                  element={<FloorDetailPage />}
                />
                <Route
                  path="/buildings/:buildingId/pois/:poiId"
                  element={<PoiDetailPage />}
                />
                <Route path="/buildings/:buildingId/live" element={<LiveMapPage />} />
                <Route
                  path="/buildings/:buildingId/analytics"
                  element={<AnalyticsPage />}
                />
                <Route path="/beacons" element={<BeaconListPage />} />
                <Route path="/pois" element={<Navigate to="/buildings" replace />} />
                <Route path="/fingerprinting" element={<SessionListPage />} />
                <Route path="/fingerprinting/:sessionId" element={<SessionDetailPage />} />
                <Route element={<RequirePermission permission="internal-users:manage" />}>
                  <Route path="/admin-users" element={<InternalUserListPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  );
}

export default App;
