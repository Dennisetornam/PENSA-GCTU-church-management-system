import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Check, Clock, Download, Upload, Lock, Unlock, AlertCircle, Pencil, Trash2 } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner, Badge, Empty } from "../ui";
import { BulkMessageBar } from "./BulkMessage";

const MANAGERS = ["super_admin", "church_admin", "president"];
const today = () => new Date().toISOString().slice(0, 10);

interface Period { id: string; name: string; academic_year: string | null; term: string | null; due_date: string | null; status: string; submitted_count: number; department_count: number; }
interface BoardRow { department_id: string; department_name: string; report_id: string | null; file_name: string | null; summary: string | null; submitted_at: string | null; submitted_by_name: string | null; head_name: string | null; head_phone: string | null; head_whatsapp: string | null; }

export function SemesterReports() {
  const { me } = useAuth();
  const canManage = MANAGERS.includes(me?.role ?? "");
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-7">
        <div className="eyebrow mb-1.5">Reports</div>
        <h1 className="flex items-center gap-2 font-display text-4xl font-semibold text-ink"><FileText size={30} className="text-gold" /> Departmental reports</h1>
        <p className="mt-2 text-ink-soft/70">{canManage ? "Open a semester, collect each department's report, and nudge the ones still pending." : "Submit your department's report for the open semester."}</p>
      </header>
      {canManage ? <ManageView /> : <SubmitView />}
    </div>
  );
}

/* ───────────────────────── Admin / President ───────────────────────── */
function ManageView() {
  const qc = useQueryClient();
  const periods = useQuery({ queryKey: ["report-periods"], queryFn: () => api.get<{ results: Period[] }>("/api/dept-reports/periods") });
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const list = periods.data?.results ?? [];
  const active = sel ?? list[0]?.id ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["report-periods"] });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl text-ink">Reporting periods</h3>
        <button className="btn-gold" onClick={() => { setEditing(null); setCreating(true); }}><Plus size={16} /> New period</button>
      </div>

      {creating && <NewPeriod onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />}
      {editing && <NewPeriod period={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); qc.invalidateQueries({ queryKey: ["report-board", editing.id] }); }} />}

      {periods.isLoading ? (
        <div className="grid h-20 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : list.length === 0 ? (
        <Empty title="No periods yet" sub="Create a reporting period to start collecting departmental reports." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {list.map((p) => (
              <button key={p.id} onClick={() => setSel(p.id)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${active === p.id ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft/70 hover:border-ink/30"}`}>
                {p.name} <span className="ml-1 rounded-full bg-ink/[0.06] px-1.5 text-xs">{p.submitted_count}/{p.department_count}</span>
              </button>
            ))}
          </div>
          {active && <Board periodId={active} onEdit={(p) => { setCreating(false); setEditing(p); }} onDeleted={() => { setSel(null); setEditing(null); refresh(); }} />}
        </>
      )}
    </div>
  );
}

function NewPeriod({ period, onClose, onDone }: { period?: Period; onClose: () => void; onDone: () => void }) {
  const isEdit = !!period;
  const [f, setF] = useState({ name: period?.name ?? "", academicYear: period?.academic_year ?? "", term: period?.term ?? "", dueDate: period?.due_date ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), academicYear: f.academicYear || null, term: f.term || null, dueDate: f.dueDate || null };
      return isEdit ? api.patch(`/api/dept-reports/periods/${period!.id}`, body) : api.post("/api/dept-reports/periods", body);
    },
    onSuccess: onDone, onError: (e: Error) => setErr(e.message),
  });
  return (
    <div className="card space-y-3 p-5">
      <h4 className="font-display text-lg text-ink">{isEdit ? "Edit period" : "New reporting period"}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Name</label><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. 2025/2026 · Semester 1" /></div>
        <div><label className="label">Academic year</label><input className="field" value={f.academicYear} onChange={(e) => setF({ ...f, academicYear: e.target.value })} placeholder="2025/2026" /></div>
        <div><label className="label">Term</label><input className="field" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} placeholder="Semester 1" /></div>
        <div><label className="label">Due date</label><input type="date" className="field" value={f.dueDate ?? ""} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
      </div>
      {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3 py-2 text-sm text-clay">{err}</div>}
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-gold" disabled={f.name.trim().length < 2 || m.isPending} onClick={() => { setErr(null); m.mutate(); }}>{m.isPending ? <Spinner /> : isEdit ? "Save changes" : "Create period"}</button>
      </div>
    </div>
  );
}

function Board({ periodId, onEdit, onDeleted }: { periodId: string; onEdit: (p: Period) => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["report-board", periodId], queryFn: () => api.get<{ period: Period; results: BoardRow[] }>(`/api/dept-reports/periods/${periodId}/board`) });
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<BoardRow | null>(null);
  const rows = data?.results ?? [];
  const period = data?.period;
  const del = useMutation({
    mutationFn: () => api.del(`/api/dept-reports/periods/${periodId}`),
    onSuccess: onDeleted,
  });
  const pending = rows.filter((r) => !r.report_id);
  const reminders = pending.filter((r) => r.head_phone).map((r) => ({ full_name: r.head_name || r.department_name, phone_number: r.head_phone!, whatsapp_number: r.head_whatsapp }));

  const toggle = useMutation({
    mutationFn: (close: boolean) => api.post(`/api/dept-reports/periods/${periodId}/${close ? "close" : "reopen"}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report-board", periodId] }); qc.invalidateQueries({ queryKey: ["report-periods"] }); },
  });

  const download = async (r: BoardRow) => {
    if (!r.report_id) return;
    setBusy(true);
    try { await api.download(`/api/dept-reports/${r.report_id}/file`, r.file_name || "report"); } finally { setBusy(false); }
  };

  if (isLoading) return <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-ink-soft/70">
          {rows.length - pending.length} of {rows.length} submitted{period?.due_date ? ` · due ${period.due_date}` : ""}
          {period?.status === "closed" && <Badge tone="ink">Closed</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {period && <button className="btn-ghost !py-2 text-sm" onClick={() => onEdit(period)}><Pencil size={15} /> Edit</button>}
          <button className="btn-ghost !py-2 text-sm" onClick={() => toggle.mutate(period?.status === "open")} disabled={toggle.isPending}>
            {period?.status === "open" ? <><Lock size={15} /> Close</> : <><Unlock size={15} /> Reopen</>}
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-xl border border-clay/30 px-3.5 py-2 text-sm font-medium text-clay transition hover:bg-clay/[0.06] disabled:opacity-50" disabled={del.isPending} onClick={() => { if (window.confirm(`Delete the period "${period?.name}"? This removes it and every report submitted to it. This cannot be undone.`)) del.mutate(); }}>
            {del.isPending ? <Spinner /> : <><Trash2 size={15} /> Delete</>}
          </button>
        </div>
      </div>

      {reminders.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-clay"><AlertCircle size={15} /> {pending.length} department{pending.length === 1 ? "" : "s"} still pending</div>
          <BulkMessageBar recipients={reminders} defaultMessage={`Reminder: please submit your department's report${period?.due_date ? ` by ${period.due_date}` : ""}. Thank you.`} context="pending department heads" />
        </div>
      )}

      <div className="card divide-y divide-ink/[0.06] overflow-hidden">
        {rows.map((r) => (
          <div key={r.department_id} className="flex items-center gap-3 p-4">
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${r.report_id ? "bg-sage/15 text-[#4d5645]" : "bg-clay/10 text-clay"}`}>{r.report_id ? <Check size={17} /> : <Clock size={16} />}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{r.department_name}</div>
              <div className="truncate text-sm text-ink-soft/55">
                {r.report_id ? <>Submitted{r.submitted_at ? ` · ${new Date(r.submitted_at).toLocaleDateString()}` : ""}{r.submitted_by_name ? ` · ${r.submitted_by_name}` : ""}</> : <>Pending{r.head_name ? ` · head: ${r.head_name}` : " · no head set"}</>}
              </div>
              {r.summary && <div className="mt-1 line-clamp-2 text-sm text-ink-soft/75">{r.summary}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {r.report_id && r.file_name && <button onClick={() => download(r)} disabled={busy} className="btn-ghost !py-2 text-sm"><Download size={15} /> File</button>}
              {period?.status === "open" && <button onClick={() => setUpload(r)} className="btn-ghost !py-2 text-sm"><Upload size={15} /> {r.report_id ? "Replace" : "Submit"}</button>}
            </div>
          </div>
        ))}
      </div>

      {upload && period && (
        <OnBehalfModal periodId={periodId} row={upload} onClose={() => setUpload(null)} onDone={() => { setUpload(null); qc.invalidateQueries({ queryKey: ["report-board", periodId] }); qc.invalidateQueries({ queryKey: ["report-periods"] }); }} />
      )}
    </div>
  );
}

// Admin / president submitting (or replacing) a department's report on their behalf.
function OnBehalfModal({ periodId, row, onClose, onDone }: { periodId: string; row: BoardRow; onClose: () => void; onDone: () => void }) {
  const [summary, setSummary] = useState(row.summary ?? "");
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(row.file_name ?? null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setErr(null); setUploading(true);
    try { const r = await api.upload<{ key: string; fileName: string }>("/api/dept-reports/upload", file); setFileKey(r.key); setFileName(r.fileName); }
    catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  };
  const submit = useMutation({
    mutationFn: () => api.post("/api/dept-reports/submit", { periodId, departmentId: row.department_id, fileKey, fileName, summary: summary.trim() || null }),
    onSuccess: onDone, onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vespers-deep/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-display text-2xl text-ink">{row.department_name}</h3>
        <p className="mb-4 text-sm text-ink-soft/65">Submit this department's report on their behalf.</p>
        <label className="label">Report file (PDF or Word)</label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/25 px-3 py-3 text-sm text-ink-soft/70 transition hover:border-gold hover:text-gold">
          {uploading ? <Spinner /> : <><Upload size={16} /> {fileName ? `Attached: ${fileName}` : "Upload report file"}</>}
          <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={pick} disabled={uploading} />
        </label>
        <label className="label mt-3">Short summary (optional)</label>
        <textarea className="field min-h-20 text-sm" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A few lines on the semester…" />
        {err && <div className="mt-2 rounded-xl border border-clay/30 bg-clay/8 px-3 py-2 text-sm text-clay">{err}</div>}
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-gold flex-1" disabled={(!fileKey && !summary.trim()) || submit.isPending} onClick={() => { setErr(null); submit.mutate(); }}>{submit.isPending ? <Spinner /> : "Save report"}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Department head ───────────────────────── */
interface MyDept { department_id: string; department_name: string; report_id: string | null; file_name: string | null; summary: string | null; submitted_at: string | null; }
export function SubmitView() {
  const { data, isLoading } = useQuery({ queryKey: ["my-reports"], queryFn: () => api.get<{ period: Period | null; departments: MyDept[] }>("/api/dept-reports/mine") });
  if (isLoading) return <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>;
  const period = data?.period;
  const depts = data?.departments ?? [];
  if (!period) return <Empty title="No open reporting period" sub="There's nothing to submit right now. You'll see a form here when a semester is opened." />;
  if (depts.length === 0) return <Empty title="No department assigned" sub="You're not set as the head of a department yet. Ask an admin to link you." />;
  return (
    <div className="space-y-5">
      <div className="card bg-gold/[0.05] p-4 text-sm text-ink-soft/80">
        Open period: <span className="font-semibold text-ink">{period.name}</span>{period.due_date ? ` · due ${period.due_date}` : ""}
      </div>
      {depts.map((d) => <SubmitCard key={d.department_id} period={period} dept={d} />)}
    </div>
  );
}

function SubmitCard({ period, dept }: { period: Period; dept: MyDept }) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState(dept.summary ?? "");
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(dept.file_name ?? null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setErr(null); setUploading(true);
    try {
      const r = await api.upload<{ key: string; fileName: string }>("/api/dept-reports/upload", file);
      setFileKey(r.key); setFileName(r.fileName);
    } catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  };

  const submit = useMutation({
    mutationFn: () => api.post("/api/dept-reports/submit", { periodId: period.id, departmentId: dept.department_id, fileKey, fileName, summary: summary.trim() || null }),
    onSuccess: () => { setOkMsg(true); setTimeout(() => setOkMsg(false), 2500); qc.invalidateQueries({ queryKey: ["my-reports"] }); },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-xl text-ink">{dept.department_name}</h3>
        {dept.report_id ? <Badge tone="sage"><Check size={12} /> Submitted</Badge> : <Badge tone="clay"><Clock size={12} /> Not submitted</Badge>}
      </div>

      <label className="label">Report file (PDF or Word)</label>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/25 px-3 py-3 text-sm text-ink-soft/70 transition hover:border-gold hover:text-gold">
        {uploading ? <Spinner /> : <><Upload size={16} /> {fileName ? `Attached: ${fileName}` : "Upload report file"}</>}
        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={pick} disabled={uploading} />
      </label>

      <label className="label mt-3">Short summary (optional)</label>
      <textarea className="field min-h-20 text-sm" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A few lines on the semester — key activities, challenges, plans…" />

      {err && <div className="mt-2 rounded-xl border border-clay/30 bg-clay/8 px-3 py-2 text-sm text-clay">{err}</div>}
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-gold" disabled={(!fileKey && !summary.trim()) || submit.isPending} onClick={() => { setErr(null); submit.mutate(); }}>{submit.isPending ? <Spinner /> : dept.report_id ? "Update submission" : "Submit report"}</button>
        {okMsg && <span className="inline-flex items-center gap-1 text-sm font-medium text-[#4d5645]"><Check size={15} /> Saved</span>}
      </div>
    </div>
  );
}
