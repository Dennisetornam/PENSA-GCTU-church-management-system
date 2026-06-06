import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Download } from "lucide-react";
import { api } from "../api";
import { Spinner, Empty } from "../ui";

const REPORTS = [
  { key: "members", title: "Members Roster", desc: "Every approved member with cell and status." },
  { key: "attendance-summary", title: "Attendance Summary", desc: "Per-session present / late / rate." },
  { key: "inactive-members", title: "Inactive Members", desc: "No attendance in the last 90 days." },
];

interface Report { title: string; columns: { key: string; label: string }[]; rows: Record<string, unknown>[]; }

export function Reports() {
  const [type, setType] = useState("members");
  const { data, isLoading } = useQuery({ queryKey: ["report", type], queryFn: () => api.get<Report>(`/api/reports/${type}`) });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7">
        <div className="eyebrow mb-1.5">Reports</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Export &amp; share</h1>
        <p className="mt-2 text-ink-soft/70">Pick a report, preview it, and download as CSV or Excel.</p>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => setType(r.key)}
            className={`card p-4 text-left transition ${type === r.key ? "ring-2 ring-gold shadow-gold" : "hover:shadow-lift"}`}>
            <div className="font-display text-lg text-ink">{r.title}</div>
            <div className="mt-1 text-sm text-ink-soft/65">{r.desc}</div>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-soft/60">{data ? `${data.rows.length} rows` : ""}</span>
        <div className="ml-auto flex gap-2">
          <a href={`/api/reports/${type}?format=csv`} className="btn-ghost"><FileText size={16} /> CSV</a>
          <a href={`/api/reports/${type}?format=xlsx`} className="btn-gold"><FileSpreadsheet size={16} /> Excel</a>
        </div>
      </div>

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : !data || data.rows.length === 0 ? (
        <Empty title="Nothing to report yet" sub="This report has no rows." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-ink-soft/70">
                {data.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-4 py-3 font-semibold">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-b border-ink/[0.05] last:border-0 hover:bg-ink/[0.02]">
                  {data.columns.map((c) => <td key={c.key} className="whitespace-nowrap px-4 py-2.5 text-ink">{String(row[c.key] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 flex items-center gap-2 text-xs text-ink-soft/50"><Download size={13} /> Downloads include all rows; the table previews up to 100.</p>
    </div>
  );
}
