import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { api } from "../api";
import { Spinner, Empty } from "../ui";

interface QuotaRow { year_month: string; base_minor: number; quota_minor: number; n: number; }
interface QuotaResp { rate: number; results: QuotaRow[]; }

const cedis = (minor: number) => "GH₵ " + (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS[Number(m)]} ${y}`; };
const thisMonth = new Date().toISOString().slice(0, 7);

export function Quota() {
  const { data, isLoading } = useQuery({ queryKey: ["quota"], queryFn: () => api.get<QuotaResp>("/api/finance/quota") });
  const rows = data?.results ?? [];
  const pct = Math.round((data?.rate ?? 0.15) * 100);
  const totalQuota = rows.reduce((a, r) => a + r.quota_minor, 0);
  const current = rows.find((r) => r.year_month === thisMonth);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-7">
        <div className="eyebrow mb-1.5">Sector quota</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Monthly quota</h1>
        <p className="mt-2 text-ink-soft/70">{pct}% of each month’s offerings (cash + Momo) and tithes is set aside for the sector.</p>
      </header>

      {/* this month + running total */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div className="card candlelight relative overflow-hidden bg-vespers p-6 text-ivory-soft">
          <div className="candlelight absolute inset-0 opacity-60" />
          <div className="relative">
            <div className="eyebrow !text-gold-soft flex items-center gap-1.5"><Landmark size={14} /> Due this month · {monthLabel(thisMonth)}</div>
            <div className="mt-1 font-display text-4xl font-semibold text-ivory-soft">{isLoading ? <Spinner /> : cedis(current?.quota_minor ?? 0)}</div>
            <div className="mt-1 text-sm text-ivory-soft/65">{pct}% of {cedis(current?.base_minor ?? 0)}</div>
          </div>
        </div>
        <div className="card p-6">
          <div className="eyebrow mb-1">Quota accrued · all time</div>
          <div className="font-display text-4xl font-semibold text-ink">{isLoading ? <Spinner /> : cedis(totalQuota)}</div>
          <div className="mt-1 text-sm text-ink-soft/60">across {rows.length} {rows.length === 1 ? "month" : "months"}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid h-32 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title="No giving recorded yet" sub="Once offerings and tithes are recorded, the monthly quota appears here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ink/10 text-left text-ink-soft/65">
              {["Month", "Offerings + tithes", `Quota (${pct}%)`, "Entries"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year_month} className={`border-b border-ink/[0.05] last:border-0 ${r.year_month === thisMonth ? "bg-gold/[0.06]" : "hover:bg-ink/[0.02]"}`}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">
                    {monthLabel(r.year_month)}
                    {r.year_month === thisMonth && <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-[0.65rem] font-semibold text-[#8a6a25]">this month</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/80">{cedis(r.base_minor)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-gold">{cedis(r.quota_minor)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/55">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
