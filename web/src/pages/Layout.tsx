import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, UserPlus, CalendarCheck, Boxes, CircleDot,
  FileBarChart, LineChart, Settings, LogOut, Search,
} from "lucide-react";
import { useAuth, roleLabel } from "../auth";
import { Wordmark } from "../brand";
import { Avatar } from "../ui";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/members", label: "Members", icon: Users },
  { to: "/dashboard/registrations", label: "Registrations", icon: UserPlus },
  { to: "/dashboard/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/dashboard/departments", label: "Departments", icon: Boxes },
  { to: "/dashboard/cells", label: "Cells", icon: CircleDot },
  { to: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { to: "/dashboard/analytics", label: "Analytics", icon: LineChart },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const { me, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="grain min-h-screen bg-ivory lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-vespers-deep/20 bg-vespers-deep text-ivory-soft lg:flex">
        <div className="px-6 py-7">
          <Wordmark subtle />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all ${
                  isActive
                    ? "bg-gold/15 text-gold-soft shadow-[inset_0_0_0_1px_rgba(195,154,74,.3)]"
                    : "text-ivory-soft/65 hover:bg-white/[0.05] hover:text-ivory-soft"
                }`
              }
            >
              <Icon size={18} strokeWidth={1.75} />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-xl bg-white/[0.04] p-3">
          <div className="flex items-center gap-3">
            <Avatar name={me?.role ?? "Admin"} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ivory-soft">{roleLabel(me?.role ?? "")}</div>
              <div className="truncate text-xs text-ivory-soft/50">Signed in</div>
            </div>
            <button
              onClick={() => logout().then(() => nav("/login"))}
              className="ml-auto rounded-lg p-2 text-ivory-soft/55 transition hover:bg-white/10 hover:text-ivory-soft"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-ink/10 bg-ivory/85 px-6 py-4 backdrop-blur-md lg:px-10">
          <div className="lg:hidden"><Wordmark /></div>
          <div className="relative ml-auto hidden w-full max-w-sm items-center sm:flex">
            <Search size={16} className="pointer-events-none absolute left-3.5 text-ink-soft/45" />
            <input placeholder="Search members by name, phone or ID…" className="field !py-2.5 pl-10 text-sm" />
          </div>
        </header>
        <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="eyebrow mb-2">{title}</div>
      <h1 className="font-display text-4xl font-semibold text-ink">In preparation</h1>
      <p className="mt-3 text-ink-soft/75">
        This room of the desk is being furnished. The data and APIs behind it are already live — the view is on its way.
      </p>
      <div className="gold-rule mt-8 max-w-xs" />
    </div>
  );
}
