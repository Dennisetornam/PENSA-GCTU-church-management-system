import { useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, FileText, Users, LogOut, Menu, X, CalendarCheck, Clock, Check } from "lucide-react";
import { useAuth, roleLabel } from "../auth";
import { Wordmark } from "../brand";
import { api } from "../api";
import { Spinner, Badge, Empty, Avatar } from "../ui";
import { BulkMessageBar } from "./BulkMessage";
import { SubmitView } from "./SemesterReports";

const NAV = [
  { to: "/head", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/head/report", label: "Submit report", icon: FileText },
  { to: "/head/members", label: "My members", icon: Users },
];

function Panel({ onNavigate, onSignOut }: { onNavigate?: () => void; onSignOut: () => void }) {
  const { me } = useAuth();
  return (
    <>
      <div className="px-6 py-7"><Wordmark subtle /></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all ${isActive ? "bg-gold/15 text-gold-soft shadow-[inset_0_0_0_1px_rgba(195,154,74,.3)]" : "text-ivory-soft/65 hover:bg-white/[0.05] hover:text-ivory-soft"}`}>
            <Icon size={18} strokeWidth={1.75} /><span className="font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-white/[0.04] p-3">
        <div className="flex items-center gap-3">
          <Avatar name={me?.name || "Head"} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ivory-soft">{me?.name}</div>
            <div className="truncate text-xs text-ivory-soft/50">{roleLabel(me?.role ?? "")}</div>
          </div>
          <button onClick={onSignOut} className="ml-auto rounded-lg p-2 text-ivory-soft/55 transition hover:bg-white/10 hover:text-ivory-soft" title="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </>
  );
}

export function HeadPortal() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const signOut = () => logout().then(() => nav("/login"));

  return (
    <div className="grain min-h-screen bg-ivory lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-vespers-deep/20 bg-vespers-deep text-ivory-soft lg:flex">
        <Panel onSignOut={signOut} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-vespers-deep/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] flex-col bg-vespers-deep text-ivory-soft shadow-2xl">
            <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-5 rounded-lg p-2 text-ivory-soft/60 hover:bg-white/10"><X size={18} /></button>
            <Panel onNavigate={() => setDrawer(false)} onSignOut={signOut} />
          </aside>
        </div>
      )}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink/10 bg-ivory/85 px-4 py-3.5 backdrop-blur-md sm:px-6 lg:px-10 lg:py-4">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="-ml-1 rounded-lg p-2 text-ink-soft/70 transition hover:bg-ink/[0.05] lg:hidden"><Menu size={20} /></button>
          <div className="lg:hidden"><Wordmark /></div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="members" element={<MyMembers />} />
            <Route path="*" element={<Navigate to="/head" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

interface Dept { id: string; name: string; member_count: number; }
interface Sub { department_id: string; department_name: string; report_id: string | null; }
function Overview() {
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["head-overview"], queryFn: () => api.get<{ departments: Dept[]; period: { id: string; name: string; due_date: string | null } | null; submissions: Sub[] }>("/api/head/overview") });
  const depts = data?.departments ?? [];
  const period = data?.period;
  const pendingCount = (data?.submissions ?? []).filter((s) => !s.report_id).length;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        <div className="eyebrow mb-1.5">Welcome</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Hello{me?.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-2 text-ink-soft/70">Your department desk — submit your report, see your members, and keep in touch.</p>
      </header>

      {isLoading ? <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {depts.map((d) => (
              <div key={d.id} className="card p-5">
                <div className="eyebrow mb-1">Department</div>
                <div className="font-display text-2xl text-ink">{d.name}</div>
                <div className="mt-1 text-sm text-ink-soft/60">{d.member_count} {d.member_count === 1 ? "member" : "members"}</div>
              </div>
            ))}
            {depts.length === 0 && <div className="sm:col-span-2"><Empty title="No department linked yet" sub="An admin will link you to your department shortly." /></div>}
          </div>

          <div className="card candlelight relative overflow-hidden bg-vespers p-6 text-ivory-soft">
            <div className="candlelight absolute inset-0 opacity-60" />
            <div className="relative">
              <div className="eyebrow !text-gold-soft mb-1">Semester report</div>
              {period ? (
                <>
                  <div className="font-display text-xl text-ivory-soft">{period.name}{period.due_date ? ` · due ${period.due_date}` : ""}</div>
                  <p className="mt-1 text-sm text-ivory-soft/70">{pendingCount > 0 ? "You still have a report to submit." : "All your reports are in — thank you!"}</p>
                  <NavLink to="/head/report" className="btn-gold relative mt-4 inline-flex"><FileText size={16} /> {pendingCount > 0 ? "Submit report" : "View / update"}</NavLink>
                </>
              ) : <p className="text-sm text-ivory-soft/70">No reporting period is open right now.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        <div className="eyebrow mb-1.5">Reports</div>
        <h1 className="flex items-center gap-2 font-display text-4xl font-semibold text-ink"><FileText size={30} className="text-gold" /> Submit report</h1>
        <p className="mt-2 text-ink-soft/70">Upload your department's report for the open semester.</p>
      </header>
      <SubmitView />
    </div>
  );
}

interface HeadMember { id: string; member_code: string | null; full_name: string; phone_number: string; whatsapp_number: string | null; level: string | null; attended_count: number; last_attended: string | null; departments: string | null; }
function MyMembers() {
  const { data, isLoading } = useQuery({ queryKey: ["head-members"], queryFn: () => api.get<{ results: HeadMember[] }>("/api/head/members") });
  const rows = data?.results ?? [];
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Directory</div>
          <h1 className="font-display text-4xl font-semibold text-ink">My members</h1>
        </div>
        {data && <Badge tone="gold">{rows.length} total</Badge>}
      </header>

      {rows.length > 0 && <BulkMessageBar recipients={rows} context={`${rows.length} members`} />}

      {isLoading ? <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
        : rows.length === 0 ? <Empty title="No members yet" sub="Members who register under your department will appear here." />
        : (
          <div className="card divide-y divide-ink/[0.06] overflow-hidden">
            {rows.map((m) => (
              <div key={m.id} className="flex items-center gap-4 p-4">
                <Avatar name={m.full_name} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{m.full_name}</div>
                  <div className="truncate text-sm text-ink-soft/55">{m.level ? `Level ${m.level} · ` : ""}{m.phone_number}</div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="inline-flex items-center gap-1.5 text-sm text-ink-soft/70" title="Gatherings attended (view only)">
                    <CalendarCheck size={14} className="text-gold" /> {m.attended_count} attended
                  </div>
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-ink-soft/50">
                    {m.last_attended ? <><Check size={11} /> last {m.last_attended}</> : <><Clock size={11} /> none yet</>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      <p className="mt-4 text-center text-xs text-ink-soft/50">Attendance shown here is view-only.</p>
    </div>
  );
}
