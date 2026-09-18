import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, Download, GraduationCap } from "lucide-react";
import { api } from "../api";
import { Avatar, Badge, Spinner, Empty } from "../ui";
import { BulkMessageBar } from "./BulkMessage";

interface Row {
  id: string; member_code: string | null; full_name: string; phone_number: string; whatsapp_number: string | null; level: string | null;
}

export function Alumni() {
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["alumni"], queryFn: () => api.get<{ results: Row[]; total: number }>("/api/members?status=alumni&limit=1000") });
  const rows = data?.results ?? [];

  const exportByCell = async () => {
    setDownloading(true);
    try { await api.download("/api/members/export?status=alumni", "alumni-by-cell.xlsx"); }
    finally { setDownloading(false); }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Completed students</div>
          <h1 className="font-display text-4xl font-semibold text-ink">Alumni</h1>
        </div>
        {data && <Badge tone="gold">{data.total} total</Badge>}
      </header>

      <p className="mb-4 text-sm text-ink-soft/70">
        Students who have completed their studies. Move a Level 400 student here from their profile using <span className="font-medium text-ink">Move to alumni</span>.
      </p>

      {rows.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button onClick={exportByCell} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-full border border-sage/40 px-3.5 py-1.5 text-sm font-medium text-[#4d5645] transition hover:bg-sage/10">
            {downloading ? <Spinner /> : <><Download size={15} /> Excel · alumni by cell</>}
          </button>
        </div>
      )}

      {rows.length > 0 && <BulkMessageBar recipients={rows} context={`${rows.length} alumni`} />}

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title="No alumni yet" sub="When a Level 400 student completes, open their profile and tap “Move to alumni”." />
      ) : (
        <div className="card divide-y divide-ink/[0.06] overflow-hidden">
          {rows.map((m) => (
            <Link key={m.id} to={`/dashboard/members/${m.id}`} className="flex items-center gap-4 p-4 transition hover:bg-ink/[0.03]">
              <Avatar name={m.full_name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{m.full_name}</div>
                <div className="text-sm text-ink-soft/55">{m.member_code ?? "—"} · {m.phone_number}</div>
              </div>
              <Badge tone="ink"><GraduationCap size={13} className="mr-1 inline" />Alumni</Badge>
              <ChevronRight size={18} className="text-ink-soft/35" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
