import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cake, Phone, MessageCircle, Copy, Check } from "lucide-react";
import { api } from "../api";
import { Spinner, Empty, Avatar } from "../ui";

interface Bday { id: string; member_code: string | null; full_name: string; date_of_birth: string; phone_number: string; whatsapp_number: string | null; }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ORDINAL = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const waNumber = (n: string) => n.replace(/[^\d]/g, ""); // wa.me wants digits only

export function Birthdays() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const { data, isLoading } = useQuery({ queryKey: ["birthdays", month], queryFn: () => api.get<{ results: Bday[] }>(`/api/members/birthdays?month=${month}`) });
  const rows = data?.results ?? [];
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    await navigator.clipboard.writeText(rows.map((r) => r.phone_number).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Celebrations</div>
          <h1 className="font-display text-4xl font-semibold text-ink">Birthdays</h1>
          <p className="mt-2 text-ink-soft/70">Everyone born in {MONTHS[month - 1]} — send them a word of blessing.</p>
        </div>
        <select className="field max-w-[12rem]" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </header>

      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/12 px-3.5 py-1.5 text-sm font-semibold text-[#8a6a25]"><Cake size={15} /> {rows.length} {rows.length === 1 ? "birthday" : "birthdays"}</span>
          <button onClick={copyAll} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3.5 py-1.5 text-sm font-medium text-ink-soft/75 transition hover:border-ink/30 hover:text-ink">
            {copied ? <><Check size={15} className="text-sage" /> Copied</> : <><Copy size={15} /> Copy all numbers</>}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid h-40 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title={`No birthdays in ${MONTHS[month - 1]}`} sub="No approved members were born this month." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-4 p-4">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gold/12 leading-none text-[#8a6a25]">
                <span className="font-display text-lg font-semibold">{dayOf(r.date_of_birth)}</span>
                <span className="text-[0.6rem] uppercase tracking-wide">{MONTHS[month - 1].slice(0, 3)}</span>
              </div>
              <Avatar name={r.full_name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{r.full_name}</div>
                <div className="text-sm text-ink-soft/60">{r.member_code ?? "—"} · turns a year older on the {ORDINAL(dayOf(r.date_of_birth))}</div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`sms:${r.phone_number}`} className="inline-flex items-center gap-1.5 rounded-full bg-vespers px-3.5 py-2 text-sm font-medium text-ivory-soft transition hover:bg-vespers-deep"><Phone size={14} /> Text</a>
                <a href={`https://wa.me/${waNumber(r.whatsapp_number ?? r.phone_number)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-sage/40 px-3.5 py-2 text-sm font-medium text-[#4d5645] transition hover:bg-sage/10"><MessageCircle size={14} /> WhatsApp</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
