import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ChevronRight, Download } from "lucide-react";
import { api } from "../api";
import { Avatar, Badge, Spinner, Empty } from "../ui";
import { BulkMessageBar } from "./BulkMessage";

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

const GENDERS: [string, string][] = [["", "All"], ["male", "Male"], ["female", "Female"]];
const LEVELS: [string, string][] = [["", "All levels"], ["100", "100"], ["200", "200"], ["300", "300"], ["400", "400"]];

export function Members() {
  const [q, setQ] = useState("");
  const [gender, setGender] = useState("");
  const [level, setLevel] = useState("");
  const [downloading, setDownloading] = useState(false);
  const dq = useDebounced(q);

  const filterQS = `${gender ? `&gender=${gender}` : ""}${level ? `&level=${level}` : ""}`;
  const filtered = !!(gender || level);
  const filterLabel = [gender && GENDERS.find(([v]) => v === gender)?.[1], level && `Level ${level}`].filter(Boolean).join(" · ");

  const exportByCell = async () => {
    setDownloading(true);
    try {
      const fname = [gender && GENDERS.find(([v]) => v === gender)?.[1], level && `Level ${level}`].filter(Boolean).join("-").replace(/\s+/g, "") || "members";
      await api.download(`/api/members/export?${filterQS.slice(1)}`, `${fname}-by-cell.xlsx`);
    } finally { setDownloading(false); }
  };
  const { data, isLoading } = useQuery({ queryKey: ["members", dq, gender, level], queryFn: () => api.get<{ results: Row[]; total: number }>(`/api/members?q=${encodeURIComponent(dq)}${filterQS}&limit=1000`) });
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

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-soft/50">Gender</span>
        {GENDERS.map(([v, l]) => (
          <button key={v} onClick={() => setGender(v)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${gender === v ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft/70 hover:border-ink/30"}`}>{l}</button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-soft/50">Level</span>
        {LEVELS.map(([v, l]) => (
          <button key={v} onClick={() => setLevel(v)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${level === v ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft/70 hover:border-ink/30"}`}>{l}</button>
        ))}
        {filtered && (
          <button onClick={exportByCell} disabled={downloading} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-sage/40 px-3.5 py-1.5 text-sm font-medium text-[#4d5645] transition hover:bg-sage/10">
            {downloading ? <Spinner /> : <><Download size={15} /> Excel · {filterLabel} by cell</>}
          </button>
        )}
      </div>

      {(dq || filtered) && rows.length > 0 && <BulkMessageBar recipients={rows} context={`${[filterLabel, dq && `“${dq}”`].filter(Boolean).join(" · ")} · ${rows.length} shown`} />}

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title="No members found" sub="Try a different search." />
      ) : (
        <div className="card divide-y divide-ink/[0.06] overflow-hidden">
          {rows.map((m) => (
            <Link key={m.id} to={`/dashboard/members/${m.id}`} className="flex items-center gap-4 p-4 transition hover:bg-ink/[0.03]">
              <Avatar name={m.full_name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{m.full_name}</div>
                <div className="text-sm text-ink-soft/55">{m.member_code ?? "—"} · {m.phone_number}</div>
              </div>
              <Badge tone={STATUS_TONE[m.membership_status] ?? "ink"}>{label(m.membership_status)}</Badge>
              <ChevronRight size={18} className="text-ink-soft/35" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
