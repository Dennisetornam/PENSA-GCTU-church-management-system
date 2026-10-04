import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Logo } from "./brand";
import { Login } from "./pages/Login";
import { Layout } from "./pages/Layout";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { Registrations } from "./pages/Registrations";
import { Members } from "./pages/Members";
import { MemberProfile } from "./pages/MemberProfile";
import { Officers } from "./pages/Officers";
import { Alumni } from "./pages/Alumni";
import { PickupPoints } from "./pages/PickupPoints";
import { HelpDesk } from "./pages/HelpDesk";
import { HelpDeskPublic } from "./pages/HelpDeskPublic";
import { PDP } from "./pages/PDP";
import { SemesterReports } from "./pages/SemesterReports";
import { Activity } from "./pages/Activity";
import { useCampus } from "./campus";
import { Attendance } from "./pages/Attendance";
import { Analytics } from "./pages/Analytics";
import { Reports } from "./pages/Reports";
import { Finance } from "./pages/Finance";
import { Birthdays } from "./pages/Birthdays";
import { Quota } from "./pages/Quota";
import { Departments, Cells, CellMembers, DepartmentMembers } from "./pages/Groups";
import { Register } from "./pages/Register";
import { FinanceGate } from "./financeGate";

function Splash() {
  return (
    <div className="grain grid min-h-screen place-items-center bg-vespers-deep">
      <div className="animate-pulse rounded-full bg-white/95 p-3 shadow-gold"><Logo size={64} /></div>
    </div>
  );
}

export function App() {
  const { me, loading } = useAuth();
  const { features } = useCampus();

  return (
    <Routes>
      {/* Public */}
      <Route path="/register" element={<Register />} />
      <Route path="/help" element={<HelpDeskPublic />} />

      {/* Auth-gated below */}
      <Route path="/login" element={loading ? <Splash /> : me ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route
        path="/dashboard"
        element={loading ? <Splash /> : me ? <Layout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Overview />} />
        <Route path="registrations" element={<Registrations />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:id" element={<MemberProfile />} />
        <Route path="officers" element={<Officers />} />
        <Route path="alumni" element={<Alumni />} />
        {features.pickupPoints && <Route path="pickup-points" element={<PickupPoints />} />}
        {features.helpDesk && <Route path="help-desk" element={<HelpDesk />} />}
        {features.pdp && <Route path="pdp" element={<PDP />} />}
        <Route path="attendance" element={<Attendance />} />
        <Route path="departments" element={<Departments />} />
        <Route path="departments/:id" element={<DepartmentMembers />} />
        <Route path="cells" element={<Cells />} />
        <Route path="cells/:id" element={<CellMembers />} />
        <Route path="birthdays" element={<Birthdays />} />
        <Route path="finance" element={<FinanceGate><Finance /></FinanceGate>} />
        <Route path="quota" element={<FinanceGate><Quota /></FinanceGate>} />
        <Route path="reports" element={<Reports />} />
        <Route path="semester-reports" element={<SemesterReports />} />
        <Route path="activity" element={<Activity />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to={me ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
