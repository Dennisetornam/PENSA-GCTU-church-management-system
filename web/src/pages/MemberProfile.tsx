import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Check, X, Phone, MessageCircle, GraduationCap, Home, Flame, Droplets, Users2, CalendarCheck } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api";
import { Spinner, Badge, Avatar } from "../ui";

interface Member {
  id: string; member_code: string | null; first_name: string; last_name: string; other_names: string | null;
  full_name: string; date_of_birth: string | null; gender: string | null; programme_id: string | null; level: string | null;
  residence_status: string | null; residence_detail: string | null; residence_during_vacation: string | null;
  cell_id: string | null; holy_ghost_baptism: number; holy_ghost_baptism_date: string | null; water_baptism: number;
  water_baptism_date: string | null; phone_number: string; whatsapp_number: string | null; membership_status: string;
  notes: string | null; join_date: string | null; profile_picture_key: string | null;
  departments: { id: string; name: string }[];
}
interface Options { programmes: { id: string; name: string }[]; departments: { id: string; name: string }[]; cells: { id: string; name: string }[]; }

const STATUS_TONE: Record<string, "gold" | "sage" | "clay" | "ink"> = { actual_member: "sage", visitor: "gold", associate: "clay", alumni: "ink" };
const lbl = (s: string | null) => (s ?? "").replace("_", " ");

export function MemberProfile() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: m, isLoading } = useQuery({ queryKey: ["member", id], queryFn: () => api.get<Member>(`/api/members/${id}`) });
  const { data: o } = useQuery({ queryKey: ["options"], queryFn: () => api.get<Options>("/register/options") });
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="grid h-60 place-items-center text-ink-soft/50"><Spinner /></div>;
  if (!m) return <div className="mx-auto max-w-2xl"><Link to="/dashboard/members" className="text-ink-soft/60">← Members</Link><p className="mt-6 font-display text-2xl text-ink">Member not found.</p></div>;

  const photo = m.profile_picture_key ? `/api/members/${m.id}/photo` : null;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => nav("/dashboard/members")} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft/60 hover:text-ink"><ArrowLeft size={15} /> Members</button>

      <div className="card overflow-hidden">
        {/* header band */}
        <div className="candlelight relative flex flex-wrap items-center gap-5 border-b border-ink/10 bg-vespers p-6 text-ivory-soft">
          <div className="candlelight absolute inset-0 opacity-60" />
          <div className="relative">
            {photo ? <img src={photo} alt={m.full_name} className="h-20 w-20 rounded-2xl object-cover ring-2 ring-gold/40" /> : <div className="h-20 w-20 rounded-2xl ring-2 ring-gold/40"><Avatar name={m.full_name} /></div>}
          </div>
          <div className="relative flex-1">
            <h1 className="font-display text-3xl font-semibold text-ivory-soft">{m.full_name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium text-gold-soft">{m.member_code ?? "—"}</span>
              <Badge tone={STATUS_TONE[m.membership_status] ?? "ink"}>{lbl(m.membership_status)}</Badge>
            </div>
          </div>
          {!editing && <button onClick={() => setEditing(true)} className="relative btn-gold"><Pencil size={15} /> Edit</button>}
        </div>

        {editing && o ? (
          <EditForm m={m} o={o} onDone={() => { setEditing(false); qc.invalidateQueries({ queryKey: ["member", id] }); qc.invalidateQueries({ queryKey: ["members"] }); }} onCancel={() => setEditing(false)} />
        ) : (
          <div className="grid gap-x-8 gap-y-5 p-6 sm:grid-cols-2">
            <Field icon={<GraduationCap size={15} />} label="Programme">{o?.programmes.find((p) => p.id === m.programme_id)?.name ?? "—"}</Field>
            <Field icon={<GraduationCap size={15} />} label="Level">{m.level ?? "—"}</Field>
            <Field icon={<Home size={15} />} label="Residence">{m.residence_status ? `${m.residence_status === "hostel_resident" ? "Hostel" : "Non-resident"}${m.residence_detail ? " · " + m.residence_detail : ""}` : "—"}</Field>
            <Field icon={<Home size={15} />} label="Vacation residence">{m.residence_during_vacation ?? "—"}</Field>
            <Field icon={<Users2 size={15} />} label="Cell">{o?.cells.find((c) => c.id === m.cell_id)?.name ?? "—"}</Field>
            <Field icon={<Users2 size={15} />} label="Departments">{m.departments.map((d) => d.name).join(", ") || "—"}</Field>
            <Field icon={<Phone size={15} />} label="Phone"><a href={`sms:${m.phone_number}`} className="text-ink hover:text-gold hover:underline">{m.phone_number}</a></Field>
            <Field icon={<MessageCircle size={15} />} label="WhatsApp">{m.whatsapp_number || m.phone_number ? <a href={`https://wa.me/${(m.whatsapp_number ?? m.phone_number).replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" className="text-[#4d5645] hover:underline">{m.whatsapp_number ?? m.phone_number}</a> : "—"}</Field>
            <Field icon={<Flame size={15} />} label="Holy Ghost baptism">{m.holy_ghost_baptism ? `Yes${m.holy_ghost_baptism_date ? " · " + m.holy_ghost_baptism_date : ""}` : "No"}</Field>
            <Field icon={<Droplets size={15} />} label="Water baptism">{m.water_baptism ? `Yes${m.water_baptism_date ? " · " + m.water_baptism_date : ""}` : "No"}</Field>
            <Field label="Date of birth">{m.date_of_birth ?? "—"}</Field>
            <Field label="Joined">{m.join_date ?? "—"}</Field>
            {m.notes && <div className="sm:col-span-2"><Field label="Notes">{m.notes}</Field></div>}
          </div>
        )}
      </div>

      {!editing && <AttendanceCard memberId={id} />}
    </div>
  );
}

interface AttData {
  totalAttended: number;
  byGathering: { gathering: string; attended: number }[];
  monthly: { year_month: string; attended: number }[];
  recent: { session_date: string; gathering: string; status: string; checked_in_at: string | null }[];
}
const ATTENDED = new Set(["present", "late"]);
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)]} ${y}`;
};

function AttendanceCard({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["member-attendance", memberId], queryFn: () => api.get<AttData>(`/api/attendance/members/${memberId}`) });
  const chart = (data?.monthly ?? []).map((r) => ({ month: monthLabel(r.year_month), attended: Number(r.attended) }));
  const attendedRecent = (data?.recent ?? []).filter((r) => ATTENDED.has(r.status)).slice(0, 10);

  return (
    <div className="card mt-5 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-xl text-ink"><CalendarCheck size={18} className="text-gold" /> Attendance trend</h3>
        {data && <Badge tone="gold">{data.totalAttended} {data.totalAttended === 1 ? "gathering" : "gatherings"} attended</Badge>}
      </div>

      {isLoading ? (
        <div className="grid h-40 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : (data?.totalAttended ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft/60">No attendance recorded yet. Once this member is checked in at a session, their trend appears here.</p>
      ) : (
        <>
          {/* per-gathering totals */}
          <div className="mb-5 flex flex-wrap gap-2">
            {(data?.byGathering ?? []).map((g) => (
              <span key={g.gathering} className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1.5 text-sm">
                <span className="font-medium text-ink">{g.gathering}</span>
                <span className="rounded-full bg-gold/15 px-1.5 text-xs font-semibold text-[#8a6a25]">{g.attended}</span>
              </span>
            ))}
          </div>

          {/* monthly trend */}
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ left: -22, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(33,27,51,.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#473F5C" }} interval={0} />
                <Tooltip cursor={{ fill: "rgba(195,154,74,.08)" }} />
                <Bar dataKey="attended" fill="#C39A4A" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* recent gatherings attended */}
          <h4 className="mb-2 mt-6 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-soft/55">Recent gatherings</h4>
          <ul className="divide-y divide-ink/[0.06]">
            {attendedRecent.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-sage/15 text-[#4d5645]"><Check size={14} /></span>
                <span className="font-medium text-ink">{r.gathering}</span>
                {r.status === "late" && <Badge tone="clay">late</Badge>}
                <span className="ml-auto tabular-nums text-ink-soft/55">{r.session_date}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Field({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-soft/55">{icon}{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}

function EditForm({ m, o, onDone, onCancel }: { m: Member; o: Options; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    firstName: m.first_name, lastName: m.last_name, otherNames: m.other_names ?? "", dateOfBirth: m.date_of_birth ?? "",
    gender: m.gender ?? "", programmeId: m.programme_id ?? "", level: m.level ?? "",
    residenceStatus: m.residence_status ?? "", residenceDetail: m.residence_detail ?? "", vacationResidence: m.residence_during_vacation ?? "",
    cellId: m.cell_id ?? "", holyGhostBaptism: !!m.holy_ghost_baptism, holyGhostBaptismDate: m.holy_ghost_baptism_date ?? "",
    waterBaptism: !!m.water_baptism, waterBaptismDate: m.water_baptism_date ?? "", phoneNumber: m.phone_number,
    whatsappNumber: m.whatsapp_number ?? "", membershipStatus: m.membership_status, notes: m.notes ?? "",
    departmentIds: m.departments.map((d) => d.id),
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const save = useMutation({ mutationFn: () => api.post(`/api/members/${m.id}`, { ...f, gender: f.gender || null }), onSuccess: onDone, onError: (e: Error) => setErr(e.message) });
  const toggleDept = (id: string) => set({ departmentIds: f.departmentIds.includes(id) ? f.departmentIds.filter((d) => d !== id) : [...f.departmentIds, id] });

  return (
    <div className="space-y-4 p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="First name"><input className="field" value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></L>
        <L label="Last name"><input className="field" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></L>
        <L label="Other names"><input className="field" value={f.otherNames} onChange={(e) => set({ otherNames: e.target.value })} /></L>
        <L label="Date of birth"><input type="date" className="field" value={f.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} /></L>
        <L label="Programme"><select className="field" value={f.programmeId} onChange={(e) => set({ programmeId: e.target.value })}><option value="">—</option>{o.programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></L>
        <L label="Level"><select className="field" value={f.level} onChange={(e) => set({ level: e.target.value })}><option value="">—</option>{["100", "200", "300", "400"].map((x) => <option key={x} value={x}>{x}</option>)}</select></L>
        <L label="Residence"><select className="field" value={f.residenceStatus} onChange={(e) => set({ residenceStatus: e.target.value })}><option value="">—</option><option value="hostel_resident">Hostel resident</option><option value="non_resident">Non-resident</option></select></L>
        <L label={f.residenceStatus === "non_resident" ? "Location" : "Hostel name"}><input className="field" value={f.residenceDetail} onChange={(e) => set({ residenceDetail: e.target.value })} /></L>
        <L label="Vacation residence"><input className="field" value={f.vacationResidence} onChange={(e) => set({ vacationResidence: e.target.value })} /></L>
        <L label="Cell"><select className="field" value={f.cellId} onChange={(e) => set({ cellId: e.target.value })}><option value="">—</option>{o.cells.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
        <L label="Phone"><input className="field" value={f.phoneNumber} onChange={(e) => set({ phoneNumber: e.target.value })} /></L>
        <L label="WhatsApp"><input className="field" value={f.whatsappNumber} onChange={(e) => set({ whatsappNumber: e.target.value })} /></L>
        <L label="Membership status"><select className="field" value={f.membershipStatus} onChange={(e) => set({ membershipStatus: e.target.value })}>{["visitor", "actual_member", "associate", "alumni"].map((s) => <option key={s} value={s}>{lbl(s)}</option>)}</select></L>
        <L label="Gender"><select className="field" value={f.gender} onChange={(e) => set({ gender: e.target.value })}><option value="">—</option><option value="male">Male</option><option value="female">Female</option></select></L>
      </div>
      <L label="Departments">
        <div className="flex flex-wrap gap-2">
          {o.departments.map((d) => (
            <button key={d.id} type="button" onClick={() => toggleDept(d.id)} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${f.departmentIds.includes(d.id) ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft"}`}>{d.name}</button>
          ))}
        </div>
      </L>
      <div className="flex flex-wrap gap-6">
        <Toggle label="Holy Ghost baptism" on={f.holyGhostBaptism} onChange={(v) => set({ holyGhostBaptism: v })} />
        <Toggle label="Water baptism" on={f.waterBaptism} onChange={(v) => set({ waterBaptism: v })} />
      </div>
      <L label="Notes"><textarea className="field min-h-20" value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></L>
      {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3.5 py-2.5 text-sm text-clay">{err}</div>}
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={onCancel}><X size={16} /> Cancel</button>
        <button className="btn-gold" disabled={!f.firstName || !f.lastName || save.isPending} onClick={() => { setErr(null); save.mutate(); }}>{save.isPending ? <Spinner /> : <><Check size={16} /> Save changes</>}</button>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm text-ink">
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-gold" : "bg-ink/15"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.45rem]" : "left-0.5"}`} /></span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
