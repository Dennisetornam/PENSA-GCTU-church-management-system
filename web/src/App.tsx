import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { ArchMark } from "./brand";
import { Login } from "./pages/Login";
import { Layout, ComingSoon } from "./pages/Layout";
import { Overview } from "./pages/Overview";
import { Registrations } from "./pages/Registrations";

function Splash() {
  return (
    <div className="grain grid min-h-screen place-items-center bg-vespers-deep text-gold">
      <div className="animate-pulse"><ArchMark size={56} /></div>
    </div>
  );
}

export function App() {
  const { me, loading } = useAuth();
  if (loading) return <Splash />;

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={me ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Overview />} />
        <Route path="registrations" element={<Registrations />} />
        <Route path="members" element={<ComingSoon title="Members" />} />
        <Route path="attendance" element={<ComingSoon title="Attendance" />} />
        <Route path="departments" element={<ComingSoon title="Departments" />} />
        <Route path="cells" element={<ComingSoon title="Cells" />} />
        <Route path="reports" element={<ComingSoon title="Reports" />} />
        <Route path="analytics" element={<ComingSoon title="Analytics" />} />
        <Route path="settings" element={<ComingSoon title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to={me ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
