import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, X, Phone, Calendar } from "lucide-react";
import { api } from "../api";
import { Avatar, Badge, Spinner, Empty } from "../ui";

interface Reg {
  id: string;
  reference: string;
  full_name: string;
  phone_number: string;
  date_of_birth: string | null;
  possible_duplicate: number;
  submitted_at: string;
}

export function Registrations() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["registrations", "pending"], queryFn: () => api.get<{ results: Reg[] }>("/api/registrations?status=pending") });
  const [busyId, setBusyId] = useState<string | null>(null);

  const approve = useMutation({
    // No membershipStatus override → the member's own choice (from the form) is used.
    mutationFn: (id: string) => api.post(`/api/registrations/${id}/approve`),
    onMutate: (id) => setBusyId(id),
    onSettled: () => { setBusyId(null); qc.invalidateQueries({ queryKey: ["registrations"] }); qc.invalidateQueries({ queryKey: ["summary"] }); qc.invalidateQueries({ queryKey: ["pending"] }); },
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/api/registrations/${id}/reject`, { reason: "Reviewed — not approved" }),
    onMutate: (id) => setBusyId(id),
    onSettled: () => { setBusyId(null); qc.invalidateQueries({ queryKey: ["registrations"] }); },
  });

  const list = data?.results ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <div className="eyebrow mb-1.5">Approval queue</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Welcome the newcomers</h1>
        <p className="mt-2 text-ink-soft/70">Each approval opens a permanent place in the fellowship — and assigns a PENSA member ID.</p>
      </header>

      {isLoading ? (
        <div className="grid h-40 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : list.length === 0 ? (
        <Empty title="All caught up" sub="No registrations are waiting for review." />
      ) : (
        <ul className="stagger space-y-3">
          {list.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-4 p-4 transition hover:shadow-lift">
              <Avatar name={r.full_name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-medium text-ink">{r.full_name}</span>
                  <Badge tone="ink">{r.reference}</Badge>
                  {r.possible_duplicate === 1 && (
                    <Badge tone="clay"><AlertTriangle size={12} /> Possible duplicate</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-ink-soft/65">
                  <span className="inline-flex items-center gap-1.5"><Phone size={13} /> {r.phone_number}</span>
                  {r.date_of_birth && <span className="inline-flex items-center gap-1.5"><Calendar size={13} /> {r.date_of_birth}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => reject.mutate(r.id)} disabled={busyId === r.id} className="btn-ghost !px-3.5" title="Reject">
                  <X size={16} />
                </button>
                <button onClick={() => approve.mutate(r.id)} disabled={busyId === r.id} className="btn-gold !px-4">
                  {busyId === r.id ? <Spinner /> : <><Check size={16} /> Approve</>}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
