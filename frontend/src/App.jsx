import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import MaintenanceRequests from "./pages/MaintenanceRequests";
import CreateMaintenanceRequest from "./pages/CreateMaintenanceRequest";
import GroupDetail from "./pages/GroupDetail";
import BlockAvailability from "./pages/BlockAvailability";
import WhatIfSimulation from "./pages/WhatIfSimulation";
import EmergencyRescheduling from "./pages/EmergencyRescheduling";
import Conflicts from "./pages/Conflicts";
import Analytics from "./pages/Analytics";
import LiveTrains from "./pages/LiveTrains";

function Protected({ children }) {
  const { manager } = useAuth();
  if (!manager) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/requests" element={<Protected><MaintenanceRequests /></Protected>} />
          <Route path="/requests/new" element={<Protected><CreateMaintenanceRequest /></Protected>} />
          <Route path="/requests/:groupId/:trackId" element={<Protected><GroupDetail /></Protected>} />
          <Route path="/windows" element={<Protected><BlockAvailability /></Protected>} />
          <Route path="/simulation" element={<Protected><WhatIfSimulation /></Protected>} />
          <Route path="/emergency" element={<Protected><EmergencyRescheduling /></Protected>} />
          <Route path="/conflicts" element={<Protected><Conflicts /></Protected>} />
          <Route path="/live-trains" element={<Protected><LiveTrains /></Protected>} />
          <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
