import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Flame, Droplets, ChevronRight, X, Phone, MessageCircle } from "lucide-react";
import { api } from "../api";
import { Spinner, Empty, Avatar } from "../ui";
import { BulkMessageBar } from "./BulkMessage";

interface Baptism { total: number; holyGhost: number; water: number; holyGhostPct: number; waterPct: number; }
interface Pending { id: string; member_code: string | null; full_name: string; phone_number: string; whatsapp_number: string | null; }
type Kind = "holy_ghost" | "water";

const TITLE: Record<Kind, string> = { holy_ghost: "Holy Ghost baptism", water: "Water baptism" };
const waNumber = (n: string) => n.replace(/[^\d]/g, "");

// Shared "Spiritual milestones" card. Each meter is clickable and opens the list
// of approved members who are yet to receive that baptism.
export function SpiritualMilestones() {
  const { data } = useQuery({ queryKey: ["baptism"], queryFn: () => api.get<Baptism>("/api/analytics/baptism") });
  const [view, setView] = useState<Kind | null>(null);
  const total = data?.total ?? 0;

  return (
    <div className="card p-6">
      <h3 className="font-display text-xl text-ink">Spiritual milestones</h3>
      <p className="mb-5 text-sm text-ink-soft/65">Across {total} members.</p>
      <MeterButton icon={<Flame size={16} />} label="Holy Ghost baptism" value={data?.holyGhost ?? 0} pct={data?.holyGhostPct ?? 0} pending={total - (data?.holyGhost ?? 0)} tone="#C39A4A" onClick={() => setView("holy_ghost")} />
      <div className="h-5" />
      <MeterButton icon={<Droplets size={16} />} label="Water baptism" value={data?.water ?? 0} pct={data?.waterPct ?? 0} pending={total - (data?.water ?? 0)} tone="#6E7A63" onClick={() => setView("water")} />
      {view && <PendingModal kind={view} onClose={() => setView(null)} />}
    </div>
  );
}

function MeterButton({ icon, label, value, pct, pending, tone, onClick }: { icon: React.ReactNode; label: string; value: number; pct: number; pending: number; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group w-full text-left">
      <div className="mb-2 flex items-center gap-2 text-sm text-ink">
        <span style={{ color: tone }}>{icon}</span>
        <span className="font-medium">{label}</span>
        <span className="ml-auto tabular-nums text-ink-soft/60">{value} · {pct}%</span>
        <ChevronRight size={15} className="text-ink-soft/35 transition group-hover:translate-x-0.5 group-hover:text-ink-soft/70" />
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.07]">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: tone }} />
      </div>
      <div className="mt-1.5 text-xs text-ink-soft/55 group-hover:text-ink-soft/80">{pending} yet to receive — tap to view</div>
    </button>
  );
}

function PendingModal({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["unbaptized", kind], queryFn: () => api.get<{ results: Pending[] }>(`/api/analytics/unbaptized?type=${kind}`) });
  const rows = data?.results ?? [];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vespers-deep/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card flex max-h-[85vh] w-full max-w-lg flex-col p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <div className="eyebrow mb-0.5">Yet to receive</div>
            <h3 className="font-display text-xl text-ink">{TITLE[kind]}</h3>
          </div>
          <div className="flex items-center gap-3">
            {!isLoading && <span className="rounded-full bg-gold/12 px-2.5 py-1 text-sm font-semibold text-[#8a6a25]">{rows.length}</span>}
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-soft/55 hover:bg-ink/5 hover:text-ink"><X size={18} /></button>
          </div>
        </div>
        <div className="overflow-y-auto p-3">
          {isLoading ? (
            <div className="grid h-32 place-items-center text-ink-soft/50"><Spinner /></div>
          ) : rows.length === 0 ? (
            <Empty title="Everyone has received it" sub="No approved members are pending this baptism." />
          ) : (
            <>
            <BulkMessageBar
              recipients={rows}
              context={TITLE[kind]}
              defaultMessage={kind === "holy_ghost"
                ? "Grace and peace! We'd love to journey with you toward the baptism of the Holy Ghost. Please reach out — PENSA GCTU."
                : "Grace and peace! We'd love to support you in taking the step of water baptism. Please reach out — PENSA GCTU."}
            />
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-ink/[0.03]">
                  <Avatar name={r.full_name} />
                  <Link to={`/dashboard/members/${r.id}`} onClick={onClose} className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink hover:underline">{r.full_name}</div>
                    <div className="truncate text-sm text-ink-soft/55">{r.member_code ?? "—"} · {r.phone_number}</div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <a href={`sms:${r.phone_number}`} title="Text" className="rounded-lg border border-ink/12 p-2 text-ink-soft/70 hover:border-ink/25 hover:text-ink"><Phone size={15} /></a>
                    <a href={`https://wa.me/${waNumber(r.whatsapp_number ?? r.phone_number)}`} target="_blank" rel="noreferrer" title="WhatsApp" className="rounded-lg border border-sage/40 p-2 text-[#4d5645] hover:bg-sage/10"><MessageCircle size={15} /></a>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
