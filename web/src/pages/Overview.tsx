import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Users, UserCheck, Sparkles, ArrowUpRight, Wallet } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { StatCard, Spinner, Badge } from "../ui";
import { SpiritualMilestones } from "./Milestones";

interface Summary { total: number; actualMembers: number; visitors: number; associates: number; alumni: number; active90d: number; holyGhostBaptized: number; waterBaptized: number; }
interface Dist { results: { id: string; name: string; count: number }[]; }
interface Regs { results: { id: string }[]; }
interface FinanceSummary { byCategory: Record<string, { total_minor: number; n: number }>; totalMinor: number; expensesMinor: number; netMinor: number; }

const DONUT = ["#C39A4A", "#6E7A63", "#BC6A45", "#2A2247"];
const cedis = (minor: number) => "GH₵ " + (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Overview() {
  const { me } = useAuth();
  const canFinance = me?.role === "super_admin" || me?.role === "church_admin";
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api.get<Summary>("/api/analytics/summary") });
  const cells = useQuery({ queryKey: ["dist-cell"], queryFn: () => api.get<Dist>("/api/analytics/distribution?dimension=cell") });
  const pending = useQuery({ queryKey: ["pending"], queryFn: () => api.get<Regs>("/api/registrations?status=pending") });
  const coffers = useQuery({ queryKey: ["coffers"], queryFn: () => api.get<FinanceSummary>("/api/finance/summary"), enabled: canFinance });

  const s = summary.data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1.5">{greet}, shepherd</div>
          <h1 className="font-display text-4xl font-semibold text-ink">The fellowship today</h1>
        </div>
        <Link to="/dashboard/registrations" className="btn-gold">
          Review registrations
          {pending.data && pending.data.results.length > 0 && (
            <span className="rounded-full bg-vespers-deep/15 px-2 py-0.5 text-xs font-bold">{pending.data.results.length}</span>
          )}
        </Link>
      </header>

      {summary.isLoading ? (
        <div className="grid h-40 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : (
        <>
          <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total members" value={s?.total ?? 0} icon={<Users size={20} />} />
            <StatCard label="Active · 90 days" value={s?.active90d ?? 0} hint="attended recently" icon={<UserCheck size={20} />} />
            <StatCard label="Visitors" value={s?.visitors ?? 0} hint="becoming family" icon={<Sparkles size={20} />} />
            <StatCard label="Pending approval" value={pending.data?.results.length ?? 0} accent icon={<ArrowUpRight size={20} />} />
          </div>

          {canFinance && (
            <Link to="/dashboard/finance" className="card candlelight relative mt-5 flex items-center gap-5 overflow-hidden bg-vespers p-6 text-ivory-soft transition hover:shadow-lift">
              <div className="candlelight absolute inset-0 opacity-60" />
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-soft"><Wallet size={22} /></span>
              <div className="relative">
                <div className="eyebrow !text-gold-soft">Actual in the church coffers</div>
                <div className="mt-0.5 font-display text-4xl font-semibold text-ivory-soft">{coffers.isLoading ? <Spinner /> : cedis(coffers.data?.netMinor ?? 0)}</div>
                {coffers.data && (coffers.data.expensesMinor > 0) && (
                  <div className="mt-1 text-xs text-ivory-soft/55">{cedis(coffers.data.totalMinor)} received − {cedis(coffers.data.expensesMinor)} expenses</div>
                )}
              </div>
              <ArrowUpRight size={20} className="relative ml-auto text-ivory-soft/50" />
            </Link>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            {/* Cell distribution */}
            <div className="card p-6">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-display text-xl text-ink">Cells</h3>
                <Badge tone="gold">{(cells.data?.results ?? []).reduce((a, c) => a + c.count, 0)} placed</Badge>
              </div>
              <p className="mb-4 text-sm text-ink-soft/65">Where the body gathers in smaller circles.</p>
              <div className="flex flex-wrap items-center gap-8">
                <div className="h-44 w-44 shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={cells.data?.results ?? []} dataKey="count" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={3} stroke="none">
                        {(cells.data?.results ?? []).map((_, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2.5">
                  {(cells.data?.results ?? []).map((c, i) => (
                    <li key={c.id} className="flex items-center gap-3 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="text-ink-soft/55">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Baptism — clickable to see who's pending */}
            <SpiritualMilestones />
          </div>
        </>
      )}
    </div>
  );
}
