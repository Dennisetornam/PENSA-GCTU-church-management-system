import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bus, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { api } from "../api";
import { Spinner, Badge, Empty } from "../ui";
import { BulkMessageBar } from "./BulkMessage";

interface Point { id: string; name: string; departure_time: string | null; location: string | null; rider_count: number; }
interface Rider { id: string; member_code: string | null; full_name: string; phone_number: string; whatsapp_number: string | null; level: string | null; residence_detail: string | null; cell_name: string; }

export function PickupPoints() {
  const { data, isLoading } = useQuery({ queryKey: ["pickup-points"], queryFn: () => api.get<{ results: Point[] }>("/api/pickup-points") });
  const points = data?.results ?? [];
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-7">
        <div className="eyebrow mb-1.5">Transport</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Bus pick-up points</h1>
        <p className="mt-2 text-ink-soft/70">Who boards from each zone — for the bus team. Tap a zone to see the riders and message them.</p>
      </header>

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : points.length === 0 ? (
        <Empty title="No pick-up points yet" sub="Zones set up for this campus will appear here." />
      ) : (
        <ul className="space-y-2">
          {points.map((p) => (
            <li key={p.id} className="card overflow-hidden">
              <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-ink/[0.02]">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/12 text-gold"><Bus size={20} /></span>
                <div className="flex-1">
                  <div className="font-medium text-ink">{p.name}</div>
                  {p.departure_time && <div className="flex items-center gap-1 text-sm text-ink-soft/60"><Clock size={13} /> {p.departure_time}</div>}
                </div>
                <Badge tone="gold">{p.rider_count} {p.rider_count === 1 ? "rider" : "riders"}</Badge>
                {open === p.id ? <ChevronDown size={18} className="text-ink-soft/40" /> : <ChevronRight size={18} className="text-ink-soft/40" />}
              </button>
              {open === p.id && <Riders pointId={p.id} label={p.name} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Riders({ pointId, label }: { pointId: string; label: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["pickup-riders", pointId], queryFn: () => api.get<{ results: Rider[] }>(`/api/pickup-points/${pointId}/members`) });
  const riders = data?.results ?? [];
  if (isLoading) return <div className="grid h-16 place-items-center border-t border-ink/[0.06] text-ink-soft/50"><Spinner /></div>;
  if (riders.length === 0) return <div className="border-t border-ink/[0.06] p-4 text-sm text-ink-soft/55">No riders registered from this zone yet.</div>;
  return (
    <div className="border-t border-ink/[0.06] p-4">
      <BulkMessageBar recipients={riders} context={`${label} · ${riders.length} riders`} />
      <ul className="divide-y divide-ink/[0.06]">
        {riders.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.full_name}</span>
            {r.level && <Badge tone="ink">L{r.level}</Badge>}
            <span className="shrink-0 text-ink-soft/55">{r.cell_name}</span>
            <span className="shrink-0 tabular-nums text-ink-soft/55">{r.phone_number}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
