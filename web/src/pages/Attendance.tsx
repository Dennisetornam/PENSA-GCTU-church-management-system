import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { CalendarPlus, Search, Check, UserCheck, ChevronRight, Lock, Wallet, Undo2, UserX, Download, X } from "lucide-react";
import { api, invalidateFinance } from "../api";
import { Spinner, Badge, Empty, Avatar } from "../ui";
import { RecordModal, type Options as FinanceOptions } from "./Finance";

interface Options { gatheringTypes: { id: string; name: string }[]; }
interface Session { id: string; gathering_name: string; title: string | null; session_date: string; status: string; present: number | null; attended: number | null; }
interface RosterRow { id: string; member_code: string | null; full_name: string; cell_id: string | null; status: string | null; }

const today = () => new Date().toISOString().slice(0, 10);

function useDebounced<T>(value: T, ms = 220) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function Attendance() {
  const [active, setActive] = useState<string | null>(null);
  return active ? <CheckIn sessionId={active} onBack={() => setActive(null)} /> : <Sessions onOpen={setActive} />;
}

function Sessions({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["att-sessions"], queryFn: () => api.get<{ results: Session[] }>("/api/attendance/sessions") });
  const options = useQuery({ queryKey: ["options"], queryFn: () => api.get<Options>("/register/options") });
  const [gt, setGt] = useState("");
  const [date, setDate] = useState(today());

  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>("/api/attendance/sessions", { gatheringTypeId: gt, sessionDate: date }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["att-sessions"] }); onOpen(r.id); },
  });

  const list = sessions.data?.results ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <div className="eyebrow mb-1.5">Attendance</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Gather the people</h1>
        <p className="mt-2 text-ink-soft/70">Start a session, then check members in by name — no cards, no fuss.</p>
      </header>

      {/* Create session */}
      <div className="card candlelight relative overflow-hidden p-6">
        <div className="relative">
          <div className="mb-4 flex items-center gap-2 text-ink"><CalendarPlus size={18} className="text-gold" /><span className="font-display text-xl">New session</span></div>
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
            <select className="field" value={gt} onChange={(e) => setGt(e.target.value)}>
              <option value="">Select gathering type…</option>
              {(options.data?.gatheringTypes ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn-gold" disabled={!gt || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner /> : <>Start session</>}
            </button>
          </div>
        </div>
      </div>

      {/* Open / recent sessions */}
      <h3 className="mb-3 mt-9 font-display text-xl text-ink">Recent sessions</h3>
      {sessions.isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : list.length === 0 ? (
        <Empty title="No sessions yet" sub="Start your first session above." />
      ) : (
        <ul className="space-y-2">
          {list.map((s) => (
            <li key={s.id}>
              <button onClick={() => onOpen(s.id)} className="card flex w-full items-center gap-4 p-4 text-left transition hover:shadow-lift">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${s.status === "open" ? "bg-gold/15 text-gold" : "bg-ink/[0.06] text-ink-soft"}`}>
                  {s.status === "open" ? <UserCheck size={20} /> : <Lock size={18} />}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-ink">{s.gathering_name}</div>
                  <div className="text-sm text-ink-soft/60">{s.session_date}</div>
                </div>
                {s.status === "open" ? <Badge tone="gold">Open</Badge> : <Badge tone="ink">{s.attended ?? 0} attended</Badge>}
                <ChevronRight size={18} className="text-ink-soft/40" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface AbsenteeRow { id: string; member_code: string | null; full_name: string; phone_number: string; }
interface AbsenteeGroups { total: number; groups: { cell_id: string | null; cell_name: string; members: AbsenteeRow[] }[]; }

function CheckIn({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [giving, setGiving] = useState(false);
  const [absentees, setAbsentees] = useState(false);
  const dq = useDebounced(q);
  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => api.get<{ gathering_type_id: string; session_date: string; status: string; summary: unknown }>(`/api/attendance/sessions/${sessionId}`) });
  const options = useQuery({ queryKey: ["options"], queryFn: () => api.get<FinanceOptions>("/register/options") });
  const roster = useQuery({
    queryKey: ["roster", sessionId, dq],
    queryFn: () => api.get<{ results: RosterRow[] }>(`/api/attendance/sessions/${sessionId}/roster?q=${encodeURIComponent(dq)}&limit=200`),
    placeholderData: keepPreviousData, // never blank the list while a search/refetch is in flight
  });

  const gatheringName = (options.data?.gatheringTypes ?? []).find((g) => g.id === session.data?.gathering_type_id)?.name ?? "Session";
  const open = session.data?.status === "open";

  // Optimistically flip a member's status across every cached roster view, so we
  // don't refetch the whole roster after each check-in (which used to blow the
  // read rate-limit and blank the list mid-attendance).
  const setStatus = (memberId: string, status: string | null) =>
    qc.setQueriesData<{ results: RosterRow[] }>({ queryKey: ["roster", sessionId] }, (old) =>
      old ? { ...old, results: old.results.map((r) => (r.id === memberId ? { ...r, status } : r)) } : old,
    );
  const optimistic = (status: string | null) => ({
    onMutate: async (memberId: string) => {
      await qc.cancelQueries({ queryKey: ["roster", sessionId] });
      const prev = qc.getQueriesData<{ results: RosterRow[] }>({ queryKey: ["roster", sessionId] });
      setStatus(memberId, status);
      return { prev };
    },
    onError: (_e: unknown, _id: string, ctx: { prev: [readonly unknown[], { results: RosterRow[] } | undefined][] } | undefined) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
  });

  const mark = useMutation({
    mutationFn: (memberId: string) => api.put(`/api/attendance/sessions/${sessionId}/records`, { marks: [{ memberId, status: "present" }] }),
    ...optimistic("present"),
  });
  // Undo a check-in (mistaken). status "absent" removes the record (sparse storage).
  const unmark = useMutation({
    mutationFn: (memberId: string) => api.put(`/api/attendance/sessions/${sessionId}/records`, { marks: [{ memberId, status: "absent" }] }),
    ...optimistic(null),
  });
  const close = useMutation({
    mutationFn: () => api.post(`/api/attendance/sessions/${sessionId}/close`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["att-sessions"] }); onBack(); },
  });
  const endSession = () => {
    if (window.confirm("End this session? Anyone not checked in will be recorded as absent.")) close.mutate();
  };

  const rows = roster.data?.results ?? [];
  const presentCount = rows.filter((r) => r.status === "present" || r.status === "late").length;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onBack} className="mb-4 text-sm text-ink-soft/60 hover:text-ink">← All sessions</button>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">{gatheringName} · {session.data?.session_date}</div>
          <h1 className="font-display text-3xl font-semibold text-ink">Check members in</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAbsentees(true)} className="btn-ghost"><UserX size={16} /> Absentees</button>
          {open && (
            <button onClick={() => setGiving(true)} className="btn-gold"><Wallet size={16} /> Record giving</button>
          )}
          <button onClick={endSession} disabled={close.isPending} className="btn-primary">
            {close.isPending ? <Spinner /> : "End session"}
          </button>
        </div>
      </header>

      {absentees && <AbsenteesModal sessionId={sessionId} label={`${gatheringName} · ${session.data?.session_date}`} onClose={() => setAbsentees(false)} />}

      {giving && options.data && session.data && (
        <RecordModal
          o={options.data}
          preset={{
            serviceTypeId: session.data.gathering_type_id,
            occurredOn: session.data.session_date,
            sessionId,
            sessionLabel: `${gatheringName} · ${session.data.session_date}`,
          }}
          onClose={() => setGiving(false)}
          onDone={() => { setGiving(false); invalidateFinance(qc); }}
        />
      )}

      <div className="card sticky top-20 z-10 mb-4 flex items-center gap-3 p-2.5">
        <Search size={18} className="ml-2 text-ink-soft/45" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a member's name…" className="w-full bg-transparent py-2 text-lg text-ink outline-none placeholder:text-ink/30" />
        <Badge tone="gold">{presentCount} in</Badge>
      </div>

      {roster.isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty
          title={q ? "No match" : "No members yet"}
          sub={q ? "Try another spelling." : "Approve registrations first, then check members in here."}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const inAlready = r.status === "present" || r.status === "late";
            return (
              <li key={r.id} className="card flex items-center gap-3 p-3 sm:gap-4 sm:p-3.5">
                <Avatar name={r.full_name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{r.full_name}</div>
                  <div className="truncate text-sm text-ink-soft/55">{r.member_code ?? "—"}</div>
                </div>
                {inAlready ? (
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/15 px-3 py-2 text-sm font-semibold text-[#4d5645] sm:px-4"><Check size={16} /><span className="hidden sm:inline">Checked in</span><span className="sm:hidden">In</span></span>
                    <button onClick={() => unmark.mutate(r.id)} disabled={unmark.isPending} title="Undo check-in (mark not present)" className="inline-flex items-center gap-1 rounded-full border border-ink/15 px-3 py-2 text-sm font-medium text-ink-soft/70 transition hover:border-clay/40 hover:text-clay"><Undo2 size={15} /><span className="hidden sm:inline">Undo</span></button>
                  </div>
                ) : (
                  <button onClick={() => mark.mutate(r.id)} disabled={mark.isPending} className="btn-gold shrink-0">Check in</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AbsenteesModal({ sessionId, label, onClose }: { sessionId: string; label: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["absentees", sessionId], queryFn: () => api.get<AbsenteeGroups>(`/api/attendance/sessions/${sessionId}/absentees`) });
  const groups = data?.groups ?? [];

  const exportXlsx = async () => {
    setBusy(true);
    try { await api.download(`/api/attendance/sessions/${sessionId}/absentees?format=xlsx`, "absentees-by-cell.xlsx"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vespers-deep/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card flex max-h-[85vh] w-full max-w-lg flex-col p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow mb-0.5">Absentees by cell</div>
            <h3 className="truncate font-display text-xl text-ink">{label}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isLoading && <span className="rounded-full bg-clay/12 px-2.5 py-1 text-sm font-semibold text-clay">{data?.total ?? 0}</span>}
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-soft/55 hover:bg-ink/5 hover:text-ink"><X size={18} /></button>
          </div>
        </div>

        <div className="border-b border-ink/10 px-5 py-3">
          <button onClick={exportXlsx} disabled={busy || (data?.total ?? 0) === 0} className="btn-gold !py-2 text-sm">{busy ? <Spinner /> : <><Download size={15} /> Export Excel (per cell)</>}</button>
        </div>

        <div className="overflow-y-auto p-4">
          {isLoading ? (
            <div className="grid h-32 place-items-center text-ink-soft/50"><Spinner /></div>
          ) : groups.length === 0 ? (
            <Empty title="No absentees" sub="Everyone approved is checked in for this session." />
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.cell_name}>
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="font-display text-lg text-ink">{g.cell_name}</h4>
                    <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-xs font-semibold text-ink-soft/70">{g.members.length}</span>
                  </div>
                  <ul className="divide-y divide-ink/[0.06]">
                    {g.members.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-clay/12 text-clay"><UserX size={14} /></span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{m.full_name}</span>
                        <span className="shrink-0 text-ink-soft/55">{m.member_code ?? m.phone_number}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
