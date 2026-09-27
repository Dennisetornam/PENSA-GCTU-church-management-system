import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Phone, MessageCircle, User, EyeOff, Check } from "lucide-react";
import { api } from "../api";
import { Spinner, Badge, Empty } from "../ui";

interface Ticket {
  id: string; reference: string | null; category: string; subject: string | null; message: string;
  is_anonymous: number; name: string | null; contact: string | null; status: string;
  admin_notes: string | null; created_at: string; handled_by_name: string | null;
}
interface Inbox { results: Ticket[]; byStatus: Record<string, number> }

const STATUS: { key: string; label: string }[] = [
  { key: "open", label: "Open" }, { key: "in_progress", label: "In progress" }, { key: "resolved", label: "Resolved" },
];
const STATUS_TONE: Record<string, "gold" | "clay" | "sage"> = { open: "clay", in_progress: "gold", resolved: "sage" };
const CAT_LABEL: Record<string, string> = { enquiry: "Enquiry", assistance: "Assistance", concern: "Concern", other: "Other" };

export function HelpDesk() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");
  const { data, isLoading } = useQuery({ queryKey: ["help-desk", filter], queryFn: () => api.get<Inbox>(`/api/help-desk?status=${filter}`) });
  const tickets = data?.results ?? [];
  const counts = data?.byStatus ?? { open: 0, in_progress: 0, resolved: 0 };
  const refresh = () => qc.invalidateQueries({ queryKey: ["help-desk"] });

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <div className="eyebrow mb-1.5">Members</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Help Desk</h1>
        <p className="mt-2 text-ink-soft/70">Enquiries, requests for assistance and concerns from members. Triage and mark them as you handle them.</p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${filter === s.key ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft/70 hover:border-ink/30"}`}>
            {s.label}<span className="rounded-full bg-ink/[0.06] px-1.5 text-xs font-semibold text-ink-soft/70">{counts[s.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : tickets.length === 0 ? (
        <Empty title="Nothing here" sub={filter === "open" ? "No open messages — you're all caught up." : "No messages in this state."} />
      ) : (
        <div className="space-y-3">{tickets.map((t) => <TicketCard key={t.id} t={t} onChanged={refresh} />)}</div>
      )}
    </div>
  );
}

function TicketCard({ t, onChanged }: { t: Ticket; onChanged: () => void }) {
  const [notes, setNotes] = useState(t.admin_notes ?? "");
  const [dirty, setDirty] = useState(false);
  const mutate = useMutation({
    mutationFn: (body: { status?: string; adminNotes?: string }) => api.patch(`/api/help-desk/${t.id}`, body),
    onSuccess: onChanged,
  });
  const wa = t.contact ? t.contact.replace(/[^\d]/g, "") : "";

  return (
    <div className="card p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="ink">{CAT_LABEL[t.category] ?? t.category}</Badge>
        <Badge tone={STATUS_TONE[t.status] ?? "ink"}>{t.status.replace("_", " ")}</Badge>
        {t.reference && <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold text-ink-soft/60">{t.reference}</span>}
        <span className="ml-auto text-xs text-ink-soft/50">{new Date(t.created_at).toLocaleString()}</span>
      </div>

      {t.subject && <div className="mb-1 font-medium text-ink">{t.subject}</div>}
      <p className="whitespace-pre-wrap text-sm text-ink-soft/85">{t.message}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {t.is_anonymous ? (
          <span className="inline-flex items-center gap-1.5 text-ink-soft/55"><EyeOff size={14} /> Anonymous</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-ink-soft/75"><User size={14} /> {t.name || "—"}</span>
            {t.contact && <a href={`sms:${t.contact}`} className="inline-flex items-center gap-1.5 text-gold hover:underline"><Phone size={14} /> {t.contact}</a>}
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#4d5645] hover:underline"><MessageCircle size={14} /> WhatsApp</a>}
          </>
        )}
      </div>

      <textarea
        className="field mt-3 min-h-16 text-sm" placeholder="Internal notes (what was done / follow-up)…"
        value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {t.status !== "in_progress" && <button onClick={() => mutate.mutate({ status: "in_progress", adminNotes: notes })} disabled={mutate.isPending} className="btn-ghost !py-2 text-sm">Mark in progress</button>}
        {t.status !== "resolved" && <button onClick={() => mutate.mutate({ status: "resolved", adminNotes: notes })} disabled={mutate.isPending} className="btn-gold !py-2 text-sm"><Check size={15} /> Mark resolved</button>}
        {t.status === "resolved" && <button onClick={() => mutate.mutate({ status: "open", adminNotes: notes })} disabled={mutate.isPending} className="btn-ghost !py-2 text-sm">Reopen</button>}
        {dirty && <button onClick={() => { mutate.mutate({ adminNotes: notes }); setDirty(false); }} disabled={mutate.isPending} className="btn-ghost !py-2 text-sm">{mutate.isPending ? <Spinner /> : "Save notes"}</button>}
      </div>
    </div>
  );
}
