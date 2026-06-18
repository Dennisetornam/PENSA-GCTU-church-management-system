import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Smartphone, HandCoins, HeartHandshake, Sparkles, Gift, Plus, Check, Upload, Paperclip, X, Pencil, Receipt, Minus } from "lucide-react";
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
const PLEDGE_STATUS: { key: string; label: string }[] = [
  { key: "fully_redeemed", label: "Fully redeemed" },
  { key: "partly_redeemed", label: "Partly redeemed" },
];
const pledgeLabel = (s: string | null) => PLEDGE_STATUS.find((p) => p.key === s)?.label ?? "";
const needsMember = (cat: string) => cat === "tithe" || cat === "pledge";
const today = () => new Date().toISOString().slice(0, 10);
const cedis = (minor: number) => "GH₵ " + (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface Options { gatheringTypes: { id: string; name: string }[]; }
export interface FinancePreset { serviceTypeId?: string; occurredOn?: string; sessionId?: string; sessionLabel?: string; }
interface Summary { byCategory: Record<string, { total_minor: number; n: number }>; totalMinor: number; expensesMinor: number; netMinor: number; }
interface Entry { id: string; category: string; amount_minor: number; service_type_id: string | null; payment_method: string | null; occurred_on: string; service_name: string | null; recorded_by_name: string | null; member_id: string | null; member_name: string | null; pledge_status: string | null; reference_image_key: string | null; notes: string | null; }
interface Expense { id: string; category: string; amount_minor: number; payment_method: string | null; occurred_on: string; recorded_by_name: string | null; receipt_image_key: string | null; notes: string | null; }
interface MemberRow { id: string; full_name: string; member_code: string | null; }
const EXPENSE_SUGGESTIONS = ["Refreshments", "Transport", "Logistics", "Equipment", "Welfare", "Honorarium", "Printing", "Rent", "Utilities", "Maintenance"];

export function Finance() {
  const qc = useQueryClient();
  const { data: o } = useQuery({ queryKey: ["options"], queryFn: () => api.get<Options>("/register/options") });
  const { data: sum, isLoading } = useQuery({ queryKey: ["finance-summary"], queryFn: () => api.get<Summary>("/api/finance/summary") });
  const { data: list } = useQuery({ queryKey: ["finance-list"], queryFn: () => api.get<{ results: Entry[] }>("/api/finance?limit=50") });
  const { data: expenses } = useQuery({ queryKey: ["finance-expenses"], queryFn: () => api.get<{ results: Expense[] }>("/api/finance/expenses?limit=50") });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-summary"] });
    qc.invalidateQueries({ queryKey: ["finance-list"] });
    qc.invalidateQueries({ queryKey: ["finance-expenses"] });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Finance</div>
          <h1 className="font-display text-4xl font-semibold text-ink">Giving &amp; offerings</h1>
          <p className="mt-2 text-ink-soft/70">Record what comes in, take out expenses, keep the actual figure.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setExpenseOpen(true)}><Receipt size={16} /> Record expense</button>
          <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> Record giving</button>
        </div>
      </header>

      {/* net / actual figure */}
      <div className="card candlelight relative mb-5 overflow-hidden bg-vespers p-6 text-ivory-soft">
        <div className="candlelight absolute inset-0 opacity-60" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow !text-gold-soft">Actual in the coffers</div>
            <div className="mt-1 font-display text-5xl font-semibold text-ivory-soft">{isLoading ? <Spinner /> : cedis(sum?.netMinor ?? 0)}</div>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-ivory-soft/55">Received</div>
              <div className="font-display text-xl font-semibold text-ivory-soft">{cedis(sum?.totalMinor ?? 0)}</div>
            </div>
            <div>
              <div className="text-ivory-soft/55">Expenses</div>
              <div className="flex items-center gap-1 font-display text-xl font-semibold text-[#e8b39c]"><Minus size={15} />{cedis(sum?.expensesMinor ?? 0)}</div>
            </div>
          </div>
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
              {["Date", "Category", "Member", "Amount", "Service", "Method", "Recorded by", ""].map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {(list?.results ?? []).map((e) => (
                <tr key={e.id} className="border-b border-ink/[0.05] last:border-0 hover:bg-ink/[0.02]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink">{e.occurred_on}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink">{CAT_LABEL[e.category] ?? e.category}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/85">
                    {e.member_name ?? "—"}
                    {e.pledge_status && <span className="ml-2 rounded-full bg-gold/12 px-2 py-0.5 text-[0.65rem] font-semibold text-gold">{pledgeLabel(e.pledge_status)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{cedis(e.amount_minor)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/75">{e.service_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 capitalize text-ink-soft/75">
                    {e.payment_method ?? "—"}
                    {e.reference_image_key && (
                      <a href={`/api/finance/image?key=${encodeURIComponent(e.reference_image_key)}`} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline" title="View Momo reference"><Paperclip size={12} /> ref</a>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/75">{e.recorded_by_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right">
                    <button onClick={() => setEditing(e)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-soft/70 transition hover:bg-ink/[0.05] hover:text-ink" title="Edit entry"><Pencil size={13} /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* expenses */}
      <div className="mb-3 mt-9 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-xl text-ink"><Receipt size={18} className="text-clay" /> Expenses</h3>
        <button onClick={() => setExpenseOpen(true)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-soft/70 transition hover:bg-ink/[0.05] hover:text-ink"><Plus size={15} /> Add</button>
      </div>
      {(expenses?.results ?? []).length === 0 ? (
        <Empty title="No expenses recorded" sub="Anything you record here is taken out of the actual figure." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ink/10 text-left text-ink-soft/65">
              {["Date", "Category", "Amount", "Method", "Recorded by", ""].map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {(expenses?.results ?? []).map((x) => (
                <tr key={x.id} className="border-b border-ink/[0.05] last:border-0 hover:bg-ink/[0.02]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink">{x.occurred_on}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink">{x.category}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-clay">−{cedis(x.amount_minor)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 capitalize text-ink-soft/75">
                    {x.payment_method ?? "—"}
                    {x.receipt_image_key && (
                      <a href={`/api/finance/image?key=${encodeURIComponent(x.receipt_image_key)}`} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline" title="View receipt"><Paperclip size={12} /> receipt</a>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft/75">{x.recorded_by_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right">
                    <button onClick={() => setEditingExpense(x)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-soft/70 transition hover:bg-ink/[0.05] hover:text-ink" title="Edit expense"><Pencil size={13} /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && o && <RecordModal o={o} onClose={() => setOpen(false)} onDone={() => { setOpen(false); refresh(); }} />}
      {editing && o && <RecordModal o={o} entry={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />}
      {expenseOpen && <ExpenseModal onClose={() => setExpenseOpen(false)} onDone={() => { setExpenseOpen(false); refresh(); }} />}
      {editingExpense && <ExpenseModal expense={editingExpense} onClose={() => setEditingExpense(null)} onDone={() => { setEditingExpense(null); refresh(); }} />}
    </div>
  );
}

export function RecordModal({ o, onClose, onDone, preset, entry }: { o: Options; onClose: () => void; onDone: () => void; preset?: FinancePreset; entry?: Entry }) {
  const isEdit = !!entry;
  const sessionBound = !isEdit && !!preset?.sessionId;
  const [f, setF] = useState(() =>
    entry
      ? {
          category: entry.category, amount: (entry.amount_minor / 100).toFixed(2), serviceTypeId: entry.service_type_id ?? "",
          paymentMethod: entry.payment_method ?? "cash", occurredOn: entry.occurred_on, memberId: entry.member_id ?? "",
          memberName: entry.member_name ?? "", pledgeStatus: entry.pledge_status ?? "",
          referenceImageKey: entry.reference_image_key ?? "",
          referenceImageUrl: entry.reference_image_key ? `/api/finance/image?key=${encodeURIComponent(entry.reference_image_key)}` : "",
          notes: entry.notes ?? "", sessionId: "",
        }
      : { category: "offering_cash", amount: "", serviceTypeId: preset?.serviceTypeId ?? "", paymentMethod: "cash", occurredOn: preset?.occurredOn ?? today(), memberId: "", memberName: "", pledgeStatus: "", referenceImageKey: "", referenceImageUrl: "", notes: "", sessionId: preset?.sessionId ?? "" },
  );
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const m = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        amount: Number(f.amount),
        serviceTypeId: f.serviceTypeId || null,
        sessionId: f.sessionId || null,
        memberId: f.memberId || null,
        memberName: needsMember(f.category) ? f.memberName.trim() || null : null,
        pledgeStatus: f.category === "pledge" ? f.pledgeStatus || null : null,
        referenceImageKey: f.category === "offering_momo" ? f.referenceImageKey || null : null,
      };
      return isEdit ? api.put(`/api/finance/${entry!.id}`, body) : api.post("/api/finance", body);
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  const memberOk = !needsMember(f.category) || f.memberName.trim().length > 1;
  const pledgeOk = f.category !== "pledge" || !!f.pledgeStatus;
  const amountOk = Number(f.amount) > 0 && memberOk && pledgeOk;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vespers-deep/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-display text-2xl text-ink">{isEdit ? "Edit entry" : "Record giving"}</h3>
        {sessionBound && <p className="mb-4 text-sm text-ink-soft/65">For <span className="font-medium text-gold">{preset?.sessionLabel}</span></p>}
        {!sessionBound && <div className="mb-4" />}
        <div className="space-y-3">
          <div><label className="label">Category</label>
            <select className="field" value={f.category} onChange={(e) => set({ category: e.target.value, memberId: "", memberName: "", pledgeStatus: "", referenceImageKey: "", referenceImageUrl: "" })}>{CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </div>

          {f.category === "offering_momo" && (
            <ImageUpload label="Momo reference (screenshot)" url={f.referenceImageUrl} onChange={(key, url) => set({ referenceImageKey: key, referenceImageUrl: url })} />
          )}
          {needsMember(f.category) && (
            <MemberField value={f.memberName} onPick={(name, id) => set({ memberName: name, memberId: id ?? "" })} />
          )}
          {f.category === "pledge" && (
            <div><label className="label">Pledge redemption</label>
              <div className="grid grid-cols-2 gap-2">
                {PLEDGE_STATUS.map((p) => (
                  <button key={p.key} type="button" onClick={() => set({ pledgeStatus: p.key })}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${f.pledgeStatus === p.key ? "border-gold bg-gold/12 text-gold" : "border-ink/15 text-ink-soft/75 hover:border-ink/30"}`}>
                    {f.pledgeStatus === p.key && <Check size={14} />}{p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div><label className="label">Amount (GH₵)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" className="field" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Service type</label>
              {sessionBound ? (
                <div className="field flex items-center bg-ink/[0.04] text-ink-soft/80">{preset?.sessionLabel?.split(" · ")[0] ?? "Session"}</div>
              ) : (
                <select className="field" value={f.serviceTypeId} onChange={(e) => set({ serviceTypeId: e.target.value })}><option value="">—</option>{o.gatheringTypes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
              )}
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
            <button className="btn-gold flex-1" disabled={!amountOk || m.isPending} onClick={() => { setErr(null); m.mutate(); }}>{m.isPending ? <Spinner /> : isEdit ? "Save changes" : "Save entry"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Upload a finance image (Momo reference or expense receipt) to R2 before saving.
function ImageUpload({ label, url, onChange }: { label: string; url: string; onChange: (key: string, url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      const r = await api.upload<{ key: string; url: string }>("/api/finance/image", file);
      onChange(r.key, r.url);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <label className="label">{label}</label>
      {url ? (
        <div className="flex items-center gap-3 rounded-xl border border-ink/12 bg-ink/[0.02] p-2">
          <img src={url} alt={label} className="h-14 w-14 rounded-lg object-cover" />
          <span className="flex-1 text-sm text-ink-soft/75">Attached</span>
          <button type="button" onClick={() => onChange("", "")} className="rounded-lg p-1.5 text-ink-soft/55 hover:bg-ink/5 hover:text-clay" title="Remove"><X size={16} /></button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/25 px-3 py-3 text-sm text-ink-soft/70 transition hover:border-gold hover:text-gold">
          {busy ? <Spinner /> : <><Upload size={16} /> Upload image</>}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} disabled={busy} />
        </label>
      )}
      {err && <div className="mt-1 text-xs text-clay">{err}</div>}
    </div>
  );
}

// Record / edit an expense (subtracted from giving to get the actual figure).
function ExpenseModal({ expense, onClose, onDone }: { expense?: Expense; onClose: () => void; onDone: () => void }) {
  const isEdit = !!expense;
  const [f, setF] = useState(() =>
    expense
      ? { category: expense.category, amount: (expense.amount_minor / 100).toFixed(2), paymentMethod: expense.payment_method ?? "cash", occurredOn: expense.occurred_on, receiptImageKey: expense.receipt_image_key ?? "", receiptImageUrl: expense.receipt_image_key ? `/api/finance/image?key=${encodeURIComponent(expense.receipt_image_key)}` : "", notes: expense.notes ?? "" }
      : { category: "", amount: "", paymentMethod: "cash", occurredOn: today(), receiptImageKey: "", receiptImageUrl: "", notes: "" },
  );
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const m = useMutation({
    mutationFn: () => {
      const body = { category: f.category.trim(), amount: Number(f.amount), paymentMethod: f.paymentMethod, occurredOn: f.occurredOn, receiptImageKey: f.receiptImageKey || null, notes: f.notes };
      return isEdit ? api.put(`/api/finance/expenses/${expense!.id}`, body) : api.post("/api/finance/expenses", body);
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  const ok = f.category.trim().length >= 2 && Number(f.amount) > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vespers-deep/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-display text-2xl text-ink">{isEdit ? "Edit expense" : "Record expense"}</h3>
        <div className="space-y-3">
          <div><label className="label">Category / purpose</label>
            <input className="field" list="expense-cats" value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Refreshments" />
            <datalist id="expense-cats">{EXPENSE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div><label className="label">Amount (GH₵)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" className="field" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Payment method</label>
              <select className="field capitalize" value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>{METHODS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </div>
            <div><label className="label">Date</label><input type="date" className="field" value={f.occurredOn} onChange={(e) => set({ occurredOn: e.target.value })} /></div>
          </div>
          <ImageUpload label="Receipt (photo)" url={f.receiptImageUrl} onChange={(key, url) => set({ receiptImageKey: key, receiptImageUrl: url })} />
          <div><label className="label">Notes</label><input className="field" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="optional" /></div>
          {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3 py-2 text-sm text-clay">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-gold flex-1" disabled={!ok || m.isPending} onClick={() => { setErr(null); m.mutate(); }}>{m.isPending ? <Spinner /> : isEdit ? "Save changes" : "Save expense"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Type-ahead member picker. Free-typed names are allowed (non-members); picking
// a result also attributes the entry to that member record.
function MemberField({ value, onPick }: { value: string; onPick: (name: string, id?: string) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  const { data } = useQuery({
    queryKey: ["finance-member-search", dq],
    queryFn: () => api.get<{ results: MemberRow[] }>(`/api/members?q=${encodeURIComponent(dq)}&limit=8`),
    enabled: open && dq.length >= 2,
  });
  const rows = data?.results ?? [];
  return (
    <div className="relative">
      <label className="label">Member name</label>
      <input
        className="field" value={q} placeholder="Type a name…" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); onPick(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && dq.length >= 2 && rows.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-ink/12 bg-ivory shadow-soft">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-ink/[0.04]"
                onMouseDown={(e) => { e.preventDefault(); setQ(r.full_name); onPick(r.full_name, r.id); setOpen(false); }}>
                <span className="text-ink">{r.full_name}</span>
                {r.member_code && <span className="text-xs text-ink-soft/55">{r.member_code}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
