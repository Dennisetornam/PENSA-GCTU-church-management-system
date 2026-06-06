import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, Users2, QrCode, Copy, ExternalLink, ShieldCheck, UserPlus, Ban, RotateCcw, Check } from "lucide-react";
import { api } from "../api";
import { useAuth, roleLabel } from "../auth";
import { Spinner, Badge, Avatar } from "../ui";

const TABS = [
  { key: "account", label: "Account", icon: KeyRound },
  { key: "team", label: "Team", icon: Users2 },
  { key: "share", label: "Share registration", icon: QrCode },
];

export function Settings() {
  const { me } = useAuth();
  const canManage = me?.role === "super_admin" || me?.role === "church_admin";
  const [tab, setTab] = useState("account");
  const tabs = TABS.filter((t) => t.key !== "team" || canManage);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-7">
        <div className="eyebrow mb-1.5">Settings</div>
        <h1 className="font-display text-4xl font-semibold text-ink">Your desk &amp; team</h1>
      </header>
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`btn ${tab === t.key ? "bg-vespers text-ivory-soft" : "border border-ink/15 text-ink-soft hover:border-ink/30"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "account" && <ChangePassword />}
      {tab === "team" && canManage && <Team />}
      {tab === "share" && <Share />}
    </div>
  );
}

function ChangePassword() {
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [conf, setConf] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation({
    mutationFn: () => api.post("/auth/change-password", { currentPassword: cur, newPassword: next }),
    onSuccess: () => { setMsg({ ok: true, text: "Password updated. Other sessions were signed out." }); setCur(""); setNext(""); setConf(""); },
    onError: (e: Error) => setMsg({ ok: false, text: e.message }),
  });
  const mismatch = next.length > 0 && next !== conf;
  return (
    <div className="card max-w-md p-6">
      <h3 className="mb-1 font-display text-xl text-ink">Change password</h3>
      <p className="mb-5 text-sm text-ink-soft/65">Use at least 12 characters.</p>
      <div className="space-y-4">
        <div><label className="label">Current password</label><input type="password" className="field" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><label className="label">New password</label><input type="password" className="field" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <div><label className="label">Confirm new password</label><input type="password" className="field" value={conf} onChange={(e) => setConf(e.target.value)} /></div>
        {mismatch && <div className="text-sm text-clay">Passwords don't match.</div>}
        {msg && <div className={`rounded-xl px-3.5 py-2.5 text-sm ${msg.ok ? "bg-sage/12 text-[#4d5645]" : "border border-clay/30 bg-clay/8 text-clay"}`}>{msg.text}</div>}
        <button className="btn-gold w-full" disabled={!cur || next.length < 12 || mismatch || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? <Spinner /> : "Update password"}
        </button>
      </div>
    </div>
  );
}

interface U { id: string; full_name: string; email: string; role: string; status: string; }
const ROLES = [["church_admin", "Church Administrator"], ["department_leader", "Department Leader"], ["cell_leader", "Cell Leader"], ["super_admin", "Super Admin"]] as const;

function Team() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ results: U[] }>("/api/users") });
  const [open, setOpen] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });
  const suspend = useMutation({ mutationFn: (u: U) => api.post(`/api/users/${u.id}/${u.status === "suspended" ? "activate" : "suspend"}`), onSuccess: invalidate });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-xl text-ink">Administrators &amp; leaders</h3>
        <button className="btn-gold" onClick={() => setOpen(true)}><UserPlus size={16} /> Add user</button>
      </div>
      {open && <AddUser onClose={() => setOpen(false)} onDone={() => { setOpen(false); invalidate(); }} />}
      {isLoading ? <div className="grid h-24 place-items-center"><Spinner /></div> : (
        <div className="card divide-y divide-ink/[0.06]">
          {(data?.results ?? []).map((u) => (
            <div key={u.id} className="flex items-center gap-4 p-4">
              <Avatar name={u.full_name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{u.full_name} {u.id === me?.userId && <span className="text-xs text-ink-soft/50">(you)</span>}</div>
                <div className="text-sm text-ink-soft/55">{u.email}</div>
              </div>
              <Badge tone={u.role === "super_admin" ? "gold" : "vespers"}><ShieldCheck size={12} /> {roleLabel(u.role)}</Badge>
              {u.status === "suspended" && <Badge tone="clay">Suspended</Badge>}
              {u.id !== me?.userId && (
                <button className="btn-ghost !px-3" title={u.status === "suspended" ? "Reactivate" : "Suspend"} onClick={() => suspend.mutate(u)}>
                  {u.status === "suspended" ? <RotateCcw size={15} /> : <Ban size={15} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ fullName: "", email: "", role: "cell_leader", password: "" });
  const m = useMutation({
    mutationFn: () => api.post("/api/users", f),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vespers-deep/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-display text-xl text-ink">Add a team member</h3>
        <div className="space-y-3">
          <div><label className="label">Full name</label><input className="field" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
          <div><label className="label">Email</label><input type="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label">Role</label>
            <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">Temporary password (min 12 chars)</label><input className="field" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3 py-2 text-sm text-clay">{err}</div>}
          <div className="flex gap-2 pt-2">
            <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-gold flex-1" disabled={!f.fullName || !f.email || f.password.length < 12 || m.isPending} onClick={() => { setErr(null); m.mutate(); }}>
              {m.isPending ? <Spinner /> : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Share() {
  const url = `${window.location.origin}/register`;
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
      <div className="card grid place-items-center p-7">
        <div className="rounded-2xl bg-white p-4 shadow-soft">
          <QRCodeSVG value={url} size={184} fgColor="#211B33" level="M" />
        </div>
        <div className="mt-3 text-center text-xs text-ink-soft/55">Scan to open the registration form</div>
      </div>
      <div className="card p-7">
        <h3 className="font-display text-2xl text-ink">Invite members to register</h3>
        <p className="mt-2 text-ink-soft/70">
          Members don&apos;t need an account. Share this link or print the QR code and display it at church.
          When someone registers, their details appear in your <strong className="text-ink">Registrations</strong> queue to approve.
        </p>
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-ink/12 bg-ivory px-4 py-3">
          <code className="flex-1 truncate text-sm text-ink">{url}</code>
          <button className="btn-ghost !px-3" onClick={copy}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</button>
        </div>
        <div className="mt-3 flex gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="btn-primary"><ExternalLink size={16} /> Open form</a>
          <button className="btn-ghost" onClick={() => window.print()}>Print QR</button>
        </div>
      </div>
    </div>
  );
}
