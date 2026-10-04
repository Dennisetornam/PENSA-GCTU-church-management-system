import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { api } from "../api";
import { Spinner, Empty } from "../ui";

interface Entry { id: string; action: string; entity_type: string; entity_id: string | null; summary: string | null; created_at: string; actor_name: string | null; }

// Friendly tone for an action string like "finance.recorded".
const toneFor = (a: string): "sage" | "clay" | "gold" | "ink" => {
  if (a.includes("delete") || a.includes("reject") || a.includes("failure")) return "clay";
  if (a.includes("create") || a.includes("approve") || a.includes("success") || a.includes("recorded")) return "sage";
  if (a.includes("update") || a.includes("change") || a.includes("edit")) return "gold";
  return "ink";
};
const TONE: Record<string, string> = {
  sage: "bg-sage/15 text-[#4d5645]", clay: "bg-clay/12 text-clay", gold: "bg-gold/15 text-[#8a6a25]", ink: "bg-ink/[0.06] text-ink-soft/70",
};

export function Activity() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["audit", applied],
    queryFn: () => api.get<{ results: Entry[] }>(`/api/audit?limit=100${applied ? `&action=${encodeURIComponent(applied)}` : ""}`),
  });
  const rows = data?.results ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <div className="eyebrow mb-1.5">Oversight</div>
        <h1 className="flex items-center gap-2 font-display text-4xl font-semibold text-ink"><ScrollText size={30} className="text-gold" /> Activity log</h1>
        <p className="mt-2 text-ink-soft/70">Every action recorded across the system — who did what, and when.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }} className="card mb-4 flex items-center gap-3 p-2.5">
        <Search size={18} className="ml-2 text-ink-soft/45" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by action (e.g. finance, delete, approve)…" className="w-full bg-transparent py-2 text-ink outline-none placeholder:text-ink/30" />
        {applied && <button type="button" onClick={() => { setQ(""); setApplied(""); }} className="btn-ghost !py-1.5 text-sm">Clear</button>}
      </form>

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title="No activity" sub="Nothing matches this filter yet." />
      ) : (
        <div className="card divide-y divide-ink/[0.06] overflow-hidden">
          {rows.map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-4">
              <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[toneFor(e.action)]}`}>{e.action}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">{e.summary || <span className="text-ink-soft/55">{e.entity_type}{e.entity_id ? ` · ${e.entity_id}` : ""}</span>}</div>
                <div className="mt-0.5 text-xs text-ink-soft/55">{e.actor_name ?? "System"} · {new Date(e.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
