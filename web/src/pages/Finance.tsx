import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Smartphone, HandCoins, HeartHandshake, Sparkles, Gift, Plus } from "lucide-react";
import { api } from "../api";
import { Spinner, Empty } from "../ui";

const CATS = [
  { key: "offering_cash", label: "Offering · Cash", icon: Banknote },
  { key: "offering_momo", label: "Offering · Momo", icon: Smartphone },
  { key: "tithe", label: "Tithes", icon: HandCoins },
  { key: "pledge", label: "Pledges", icon: HeartHandshake },
  { key: "fundraising", label: "Fundraising", icon: Sparkles },
  { key: "free_will", label: "Free Will", icon: Gift },
] as const;
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.key, c.label]));
const METHODS = ["cash", "momo", "bank", "card", "cheque"];
const today = () => new Date().toISOString().slice(0, 10);
const cedis = (minor: number) => "GH₵ " + (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Options { gatheringTypes: { id: string; name: string }[]; }
interface Summary { byCategory: Record<string, { total_minor: number; n: number }>; totalMinor: number; }
interface Entry { id: string; category: string; amount_minor: number; payment_method: string | null; occurred_on: string; service_name: string | null; recorded_by_name: string | null; }

export function Finance() {
  const qc = useQueryClient();
  const { data: o } = useQuery({ queryKey: ["options"], queryFn: () => api.get<Options>("/register/options") });
  const { data: sum, isLoading } = useQuery({ queryKey: ["finance-summary"], queryFn: () => api.get<Summary>("/api/finance/summary") });
  const { data: list } = useQuery({ queryKey: ["finance-list"], queryFn: () => api.get<{ results: Entry[] }>("/api/finance?limit=50") });
  const [open, setOpen] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["finance-summary"] }); qc.invalidateQueries({ queryKey: ["finance-list"] }); };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Finance</div>
          <h1 className="font-display text-4xl font-semibold text-ink">Giving &amp; offerings</h1>
          <p className="mt-2 text-ink-soft/70">Record what comes in during each service.</p>
        </div>
        <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> Record giving</button>
      </header>

      {/* grand total */}
      <div className="card candlelight relative mb-5 overflow-hidden bg-vespers p-6 text-ivory-soft">
        <div className="candlelight absolute inset-0 opacity-60" />
        <div className="relative">
          <div className="eyebrow !text-gold-soft">Total recorded</div>
          <div className="mt-1 font-display text-5xl font-semibold text-ivory-soft">{isLoading ? <Spinner /> : cedis(sum?.totalMinor ?? 0)}</div>
        </div>
      </div>

      {/* category breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATS.map(({ key, label, icon: Icon }) => {
          const c = sum?.byCategory[key];
          return (
            <div key={key} className="card p-5">
              <div className="mb-2 flex items-center gap-2 text-gold"><Icon size={18} /><span className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-soft/65">{label}</span></div>
              <div className="font-display text-2xl font-semibold text-ink">{cedis(c?.total_minor ?? 0)}</div>
              <div className="mt-0.5 text-xs text-ink-soft/55">{c?.n ?? 0} {c?.n === 1 ? "entry" : "entries"}</div>
            </div>
          );
        })}
      </div>

      {/* recent entries */}
      <h3 className="mb-3 mt-9 font-display text-xl text-ink">Recent entries</h3>
      {(list?.results ?? []).length === 0 ? (
        <Empty title="No giving recorded yet" sub="Use “Record giving” to add the first entry." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ink/10 text-left text-ink-soft/65">
              {["Date", "Category", "Amount", "Service", "Method", "Recorded by"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {(list?.results ?? []).map((e) => (
                <tr key={e.id} className="border-b border-ink/[0.05] last:border-0 hover:bg-ink/[0.02]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink">{e.occurred_on}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink">{CAT_LABEL[e.category] ?? e.category}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{cedis(e.amount_minor)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/75">{e.service_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 capitalize text-ink-soft/75">{e.payment_method ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/75">{e.recorded_by_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && o && <RecordModal o={o} onClose={() => setOpen(false)} onDone={() => { setOpen(false); refresh(); }} />}
    </div>
  );
}

function RecordModal({ o, onClose, onDone }: { o: Options; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ category: "offering_cash", amount: "", serviceTypeId: "", paymentMethod: "cash", occurredOn: today(), notes: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const m = useMutation({
    mutationFn: () => api.post("/api/finance", { ...f, amount: Number(f.amount), serviceTypeId: f.serviceTypeId || null }),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  const amountOk = Number(f.amount) > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vespers-deep/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-display text-2xl text-ink">Record giving</h3>
        <div className="space-y-3">
          <div><label className="label">Category</label>
            <select className="field" value={f.category} onChange={(e) => set({ category: e.target.value })}>{CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </div>
          <div><label className="label">Amount (GH₵)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" className="field" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Service type</label>
              <select className="field" value={f.serviceTypeId} onChange={(e) => set({ serviceTypeId: e.target.value })}><option value="">—</option>{o.gatheringTypes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            </div>
            <div><label className="label">Payment method</label>
              <select className="field capitalize" value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>{METHODS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </div>
          </div>
          <div><label className="label">Date</label><input type="date" className="field" value={f.occurredOn} onChange={(e) => set({ occurredOn: e.target.value })} /></div>
          <div><label className="label">Notes</label><input className="field" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="optional" /></div>
          {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3 py-2 text-sm text-clay">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-gold flex-1" disabled={!amountOk || m.isPending} onClick={() => { setErr(null); m.mutate(); }}>{m.isPending ? <Spinner /> : "Save entry"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
