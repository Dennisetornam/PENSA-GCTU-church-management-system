import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../api";
import { Avatar, Badge, Spinner, Empty } from "../ui";

interface Row { id: string; member_code: string | null; full_name: string; phone_number: string; cell_id: string | null; membership_status: string; }

const STATUS_TONE: Record<string, "gold" | "sage" | "clay" | "ink"> = {
  actual_member: "sage", visitor: "gold", associate: "clay", alumni: "ink",
};
const label = (s: string) => s.replace("_", " ");

function useDebounced<T>(v: T, ms = 220) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

export function Members() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { data, isLoading } = useQuery({ queryKey: ["members", dq], queryFn: () => api.get<{ results: Row[]; total: number }>(`/api/members?q=${encodeURIComponent(dq)}&limit=50`) });
  const rows = data?.results ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Directory</div>
          <h1 className="font-display text-4xl font-semibold text-ink">Members</h1>
        </div>
        {data && <Badge tone="gold">{data.total} total</Badge>}
      </header>

      <div className="card mb-4 flex items-center gap-3 p-2.5">
        <Search size={18} className="ml-2 text-ink-soft/45" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or member ID…" className="w-full bg-transparent py-2 text-ink outline-none placeholder:text-ink/30" />
      </div>

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title="No members found" sub="Try a different search." />
      ) : (
        <div className="card divide-y divide-ink/[0.06] overflow-hidden">
          {rows.map((m) => (
            <div key={m.id} className="flex items-center gap-4 p-4 transition hover:bg-ink/[0.02]">
              <Avatar name={m.full_name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{m.full_name}</div>
                <div className="text-sm text-ink-soft/55">{m.member_code ?? "—"} · {m.phone_number}</div>
              </div>
              <Badge tone={STATUS_TONE[m.membership_status] ?? "ink"}>{label(m.membership_status)}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
