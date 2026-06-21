import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { Crown, Wallet } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Avatar, Spinner, Badge } from "../ui";
import { SpiritualMilestones } from "./Milestones";

interface Summary { total: number; actualMembers: number; visitors: number; associates: number; alumni: number; active90d: number; }
interface Dist { results: { id: string; name: string; count: number }[]; }
interface Trend { results: { session_date: string; gathering: string; attended: number }[]; }
interface Personality { member: { id: string; full_name: string; member_code: string | null; attendances: number } | null; }
interface FinanceSummary { byCategory: Record<string, { total_minor: number; n: number }>; totalMinor: number; expensesMinor: number; netMinor: number; }

const PALETTE = ["#C39A4A", "#6E7A63", "#BC6A45", "#2A2247"];
const FIN_CATS: { key: string; label: string }[] = [
  { key: "offering_cash", label: "Offering · Cash" }, { key: "offering_momo", label: "Offering · Momo" },
  { key: "tithe", label: "Tithes" }, { key: "pledge", label: "Pledges" },
  { key: "fundraising", label: "Fundraising" }, { key: "free_will", label: "Free Will" },
];
const cedis = (minor: number) => "GH₵ " + (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Analytics() {
  const { me } = useAuth();
  const canFinance = me?.role === "super_admin" || me?.role === "church_admin";
  const summary = useQuery({ queryKey: ["a-summary"], queryFn: () => api.get<Summary>("/api/analytics/summary") });
  const cells = useQuery({ queryKey: ["a-cell"], queryFn: () => api.get<Dist>("/api/analytics/distribution?dimension=cell") });
  const depts = useQuery({ queryKey: ["a-dept"], queryFn: () => api.get<Dist>("/api/analytics/distribution?dimension=department") });
  const trend = useQuery({ queryKey: ["a-trend"], queryFn: () => api.get<Trend>("/api/analytics/attendance-trend?limit=12") });
  const personality = useQuery({ queryKey: ["a-personality"], queryFn: () => api.get<Personality>("/api/analytics/personality") });
  const finance = useQuery({ queryKey: ["a-finance"], queryFn: () => api.get<FinanceSummary>("/api/finance/summary"), enabled: canFinance });

  const p = personality.data?.member;
  const fin = finance.data;
  const finMax = Math.max(1, ...FIN_CATS.map((c) => fin?.byCategory[c.key]?.total_minor ?? 0));
  const trendData = (trend.data?.results ?? []).slice().reverse().map((r) => ({ date: r.session_date.slice(5), attended: r.attended }));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <div className="eyebrow mb-1.5">Analytics</div>
        <h1 className="font-display text-4xl font-semibold text-ink">The life of the fellowship</h1>
      </header>

      {/* Personality of the Week */}
      <div className="card candlelight relative mb-5 overflow-hidden bg-vespers p-7 text-ivory-soft">
        <div className="candlelight absolute inset-0 opacity-70" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2 text-gold-soft">
            <Crown size={22} /><span className="eyebrow !text-gold-soft">Personality of the Week</span>
          </div>
          <div className="flex flex-1 items-center gap-4">
            {personality.isLoading ? <Spinner /> : p ? (
              <>
                <div className="ring-2 ring-gold/50 rounded-full"><Avatar name={p.full_name} /></div>
                <div>
                  <div className="font-display text-2xl font-semibold text-ivory-soft">{p.full_name}</div>
                  <div className="text-sm text-ivory-soft/65">{p.member_code ?? ""} · most faithful this week</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-display text-4xl font-semibold text-gold-soft">{p.attendances}</div>
                  <div className="text-xs uppercase tracking-widest text-ivory-soft/55">gatherings</div>
                </div>
              </>
            ) : (
              <div className="text-ivory-soft/65">No attendance recorded this week yet — check members in to crown someone.</div>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          ["Total", summary.data?.total], ["Active 90d", summary.data?.active90d], ["Actual", summary.data?.actualMembers],
          ["Visitors", summary.data?.visitors], ["Associates", summary.data?.associates], ["Alumni", summary.data?.alumni],
        ].map(([l, v]) => (
          <div key={l as string} className="card p-4">
            <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-ink-soft/60">{l}</div>
            <div className="mt-1 font-display text-3xl font-semibold text-ink">{v ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Finance performance */}
      {canFinance && (
        <div className="card mb-5 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-display text-xl text-ink"><Wallet size={18} className="text-gold" /> Finance performance</h3>
            <div className="flex gap-5 text-right">
              <div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-ink-soft/55">Received</div>
                <div className="font-display text-xl font-semibold text-ink">{finance.isLoading ? <Spinner /> : cedis(fin?.totalMinor ?? 0)}</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-ink-soft/55">Expenses</div>
                <div className="font-display text-xl font-semibold text-clay">−{cedis(fin?.expensesMinor ?? 0)}</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-gold">Net</div>
                <div className="font-display text-xl font-semibold text-ink">{cedis(fin?.netMinor ?? 0)}</div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {FIN_CATS.map((c) => {
              const v = fin?.byCategory[c.key]?.total_minor ?? 0;
              return (
                <div key={c.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{c.label}</span>
                    <span className="tabular-nums text-ink-soft/70">{cedis(v)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.07]">
                    <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(v / finMax) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Attendance trend */}
        <div className="card p-6">
          <h3 className="mb-4 font-display text-xl text-ink">Attendance trend</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(33,27,51,.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#473F5C" }} />
                <Tooltip />
                <Line type="monotone" dataKey="attended" stroke="#C39A4A" strokeWidth={2.5} dot={{ r: 3, fill: "#C39A4A" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cell donut */}
        <div className="card p-6">
          <h3 className="mb-2 font-display text-xl text-ink">Cell distribution</h3>
          <div className="flex items-center gap-6">
            <div className="h-48 w-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={cells.data?.results ?? []} dataKey="count" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="none">
                    {(cells.data?.results ?? []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 text-sm">
              {(cells.data?.results ?? []).map((c, i) => (
                <li key={c.id} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="font-medium text-ink">{c.name}</span><span className="text-ink-soft/55">{c.count}</span></li>
              ))}
            </ul>
          </div>
        </div>

        {/* Department participation */}
        <div className="card p-6">
          <h3 className="mb-4 font-display text-xl text-ink">Department participation</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={depts.data?.results ?? []} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(33,27,51,.08)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#473F5C" }} interval={0} />
                <Tooltip />
                <Bar dataKey="count" fill="#6E7A63" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Baptism — clickable to see who's pending */}
        <SpiritualMilestones />
      </div>
    </div>
  );
}
