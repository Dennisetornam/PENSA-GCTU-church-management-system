import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { ArchMark } from "./brand";
import { Login } from "./pages/Login";
import { Layout, ComingSoon } from "./pages/Layout";
import { Overview } from "./pages/Overview";
import { Registrations } from "./pages/Registrations";
import { Members } from "./pages/Members";
import { Attendance } from "./pages/Attendance";
import { Analytics } from "./pages/Analytics";
import { Reports } from "./pages/Reports";
import { Departments, Cells } from "./pages/Groups";
import { Register } from "./pages/Register";

function Splash() {
  return (
    <div className="grain grid min-h-screen place-items-center bg-vespers-deep text-gold">
      <div className="animate-pulse"><ArchMark size={56} /></div>
    </div>
  );
}

export function App() {
  const { me, loading } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/register" element={<Register />} />

      {/* Auth-gated below */}
      <Route path="/login" element={loading ? <Splash /> : me ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route
        path="/dashboard"
        element={loading ? <Splash /> : me ? <Layout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Overview />} />
        <Route path="registrations" element={<Registrations />} />
        <Route path="members" element={<Members />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="departments" element={<Departments />} />
        <Route path="cells" element={<Cells />} />
        <Route path="reports" element={<Reports />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<ComingSoon title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to={me ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
