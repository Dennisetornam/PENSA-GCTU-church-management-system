import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Search, Check, UserCheck, ChevronRight, Lock, Wallet } from "lucide-react";
import { api } from "../api";
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

function CheckIn({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [giving, setGiving] = useState(false);
  const dq = useDebounced(q);
  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => api.get<{ gathering_type_id: string; session_date: string; status: string; summary: unknown }>(`/api/attendance/sessions/${sessionId}`) });
  const options = useQuery({ queryKey: ["options"], queryFn: () => api.get<FinanceOptions>("/register/options") });
  const roster = useQuery({ queryKey: ["roster", sessionId, dq], queryFn: () => api.get<{ results: RosterRow[] }>(`/api/attendance/sessions/${sessionId}/roster?q=${encodeURIComponent(dq)}&limit=40`) });

  const gatheringName = (options.data?.gatheringTypes ?? []).find((g) => g.id === session.data?.gathering_type_id)?.name ?? "Session";
  const open = session.data?.status === "open";

  const mark = useMutation({
    mutationFn: (memberId: string) => api.put(`/api/attendance/sessions/${sessionId}/records`, { marks: [{ memberId, status: "present" }] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster", sessionId] }),
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
        <div className="flex gap-2">
          {open && (
            <button onClick={() => setGiving(true)} className="btn-gold"><Wallet size={16} /> Record giving</button>
          )}
          <button onClick={endSession} disabled={close.isPending} className="btn-primary">
            {close.isPending ? <Spinner /> : "End session"}
          </button>
        </div>
      </header>

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
          onDone={() => setGiving(false)}
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
              <li key={r.id} className="card flex items-center gap-4 p-3.5">
                <Avatar name={r.full_name} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{r.full_name}</div>
                  <div className="text-sm text-ink-soft/55">{r.member_code ?? "—"}</div>
                </div>
                {inAlready ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/15 px-4 py-2 text-sm font-semibold text-[#4d5645]"><Check size={16} /> Checked in</span>
                ) : (
                  <button onClick={() => mark.mutate(r.id)} disabled={mark.isPending} className="btn-gold">Check in</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
