import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Check, Upload, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { api } from "../api";
import { Wordmark } from "../brand";
import { Spinner } from "../ui";

// Cloudflare Turnstile TEST site key (always passes). Swap for the real key at launch.
const TURNSTILE_SITEKEY = "1x00000000000000000000AA";

interface Options {
  programmes: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  cells: { id: string; name: string }[];
  gatheringTypes: { id: string; name: string }[];
  turnstileSiteKey?: string;
}

interface Form {
  firstName: string; lastName: string; otherNames: string; dateOfBirth: string; profileImageKey: string;
  programmeId: string; residenceStatus: string; residenceDetail: string; vacationResidence: string;
  departmentIds: string[]; cellId: string; membershipStatus: string;
  holyGhostBaptism: boolean; holyGhostBaptismDate: string; waterBaptism: boolean; waterBaptismDate: string;
  phoneNumber: string; whatsappNumber: string;
}

const EMPTY: Form = {
  firstName: "", lastName: "", otherNames: "", dateOfBirth: "", profileImageKey: "",
  programmeId: "", residenceStatus: "", residenceDetail: "", vacationResidence: "",
  departmentIds: [], cellId: "", membershipStatus: "visitor",
  holyGhostBaptism: false, holyGhostBaptismDate: "", waterBaptism: false, waterBaptismDate: "",
  phoneNumber: "", whatsappNumber: "",
};

const phoneDigits = (s: string) => s.replace(/\D/g, "");

const STEPS = ["Personal", "Academic & Home", "Church Life", "Spiritual", "Contact", "Review"];

export function Register() {
  const options = useQuery({ queryKey: ["options"], queryFn: () => api.get<Options>("/register/options") });
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tsRef = useRef<HTMLDivElement>(null);

  const set = (p: Partial<Form>) => setF((s) => ({ ...s, ...p }));
  const o = options.data;

  // Render Turnstile on the review step
  useEffect(() => {
    if (step !== 5) return;
    const render = () => {
      const w = (window as unknown as { turnstile?: { render: (el: HTMLElement, opts: object) => void } }).turnstile;
      if (w && tsRef.current && !tsRef.current.hasChildNodes()) {
        w.render(tsRef.current, { sitekey: options.data?.turnstileSiteKey ?? TURNSTILE_SITEKEY, callback: (t: string) => setToken(t) });
      }
    };
    if (!document.getElementById("cf-turnstile-script")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true; s.defer = true; s.onload = render;
      document.head.appendChild(s);
    } else render();
    const t = setInterval(render, 400);
    return () => clearInterval(t);
  }, [step, options.data]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/register/image", { method: "POST", credentials: "include", body });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { key: string };
      set({ profileImageKey: data.key });
      setPreview(URL.createObjectURL(file));
    } catch {
      setErr("That image couldn't be uploaded. Try a JPG or PNG under 5MB.");
    } finally {
      setUploading(false);
    }
  }

  const valid: Record<number, boolean> = {
    0: !!(f.firstName && f.lastName && f.dateOfBirth && f.profileImageKey),
    1: !!(f.programmeId && f.residenceStatus && f.residenceDetail && f.vacationResidence),
    2: !!(f.departmentIds.length && f.cellId && f.membershipStatus),
    3: true,
    4: phoneDigits(f.phoneNumber).length === 10,
    5: !!token,
  };

  async function submit() {
    setSubmitting(true); setErr(null);
    try {
      const res = await api.post<{ reference: string }>("/register/submit", { ...f, turnstileToken: token || "test" });
      setDone(res.reference);
    } catch {
      setErr("Something went wrong submitting. Please review your details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <Confirmation reference={done} />;

  return (
    <div className="grain candlelight min-h-screen bg-ivory">
      <div className="mx-auto max-w-xl px-5 py-8">
        <div className="mb-7 flex justify-center"><Wordmark /></div>

        {/* progress */}
        <div className="mb-6 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? "bg-gold" : "bg-ink/10"}`} />
          ))}
        </div>
        <div className="mb-5 text-center">
          <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{stepTitle(step)}</h1>
        </div>

        <div className="card p-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.25 }}>
              {!o ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
                <>
                  {step === 0 && <StepPersonal f={f} set={set} preview={preview} uploading={uploading} onPhoto={uploadPhoto} />}
                  {step === 1 && <StepAcademic f={f} set={set} o={o} />}
                  {step === 2 && <StepChurch f={f} set={set} o={o} />}
                  {step === 3 && <StepSpiritual f={f} set={set} />}
                  {step === 4 && <StepContact f={f} set={set} />}
                  {step === 5 && <StepReview f={f} o={o} tsRef={tsRef} />}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {err && <div className="mt-4 rounded-xl border border-clay/30 bg-clay/8 px-3.5 py-2.5 text-sm text-clay">{err}</div>}

          <div className="mt-6 flex items-center justify-between">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn-ghost disabled:opacity-0">
              <ChevronLeft size={16} /> Back
            </button>
            {step < 5 ? (
              <button onClick={() => setStep((s) => s + 1)} disabled={!valid[step]} className="btn-primary">Next <ChevronRight size={16} /></button>
            ) : (
              <button onClick={submit} disabled={!valid[5] || submitting} className="btn-gold">{submitting ? <Spinner /> : "Submit registration"}</button>
            )}
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-ink-soft/50">Your details are kept safely and reviewed by a leader before approval.</p>
      </div>
    </div>
  );
}

const stepTitle = (s: number) => ["Tell us about you", "Studies & home", "Your place in church", "Your walk with God", "How we reach you", "Review & submit"][s];

/* ---- Steps ---- */
function Label({ children }: { children: React.ReactNode }) { return <label className="label">{children}</label>; }

function StepPersonal({ f, set, preview, uploading, onPhoto }: { f: Form; set: (p: Partial<Form>) => void; preview: string | null; uploading: boolean; onPhoto: (file: File) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center">
        <label className="group relative cursor-pointer">
          <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-full border-2 border-dashed border-gold/40 bg-gold/5 text-gold">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : uploading ? <Spinner /> : <Upload size={26} />}
          </div>
          <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
          <span className="mt-2 block text-center text-xs font-medium text-ink-soft/70">{f.profileImageKey ? "Change photo" : "Add photo *"}</span>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First name *</Label><input className="field" value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></div>
        <div><Label>Last name *</Label><input className="field" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></div>
      </div>
      <div><Label>Other names</Label><input className="field" value={f.otherNames} onChange={(e) => set({ otherNames: e.target.value })} /></div>
      <div><Label>Date of birth *</Label><input type="date" className="field" value={f.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} /></div>
    </div>
  );
}

function StepAcademic({ f, set, o }: { f: Form; set: (p: Partial<Form>) => void; o: Options }) {
  return (
    <div className="space-y-4">
      <div><Label>Programme of study *</Label>
        <select className="field" value={f.programmeId} onChange={(e) => set({ programmeId: e.target.value })}>
          <option value="">Select your programme…</option>
          {o.programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div><Label>Residence *</Label>
        <Choice options={[["hostel_resident", "Hostel resident"], ["non_resident", "Non-resident"]]} value={f.residenceStatus} onChange={(v) => set({ residenceStatus: v, residenceDetail: "" })} />
      </div>
      {f.residenceStatus === "hostel_resident" && (
        <div><Label>Name of hostel *</Label><input className="field" value={f.residenceDetail} onChange={(e) => set({ residenceDetail: e.target.value })} placeholder="e.g. Pentecost Hall" /></div>
      )}
      {f.residenceStatus === "non_resident" && (
        <div><Label>Where do you stay? (location) *</Label><input className="field" value={f.residenceDetail} onChange={(e) => set({ residenceDetail: e.target.value })} placeholder="e.g. Madina, Accra" /></div>
      )}
      <div><Label>Where do you stay during vacation? *</Label><input className="field" value={f.vacationResidence} onChange={(e) => set({ vacationResidence: e.target.value })} placeholder="e.g. Kumasi" /></div>
    </div>
  );
}

function StepChurch({ f, set, o }: { f: Form; set: (p: Partial<Form>) => void; o: Options }) {
  const toggleDept = (id: string) => set({ departmentIds: f.departmentIds.includes(id) ? f.departmentIds.filter((d) => d !== id) : [...f.departmentIds, id] });
  return (
    <div className="space-y-4">
      <div><Label>Department(s) you serve in *</Label>
        <div className="flex flex-wrap gap-2">
          {o.departments.map((d) => (
            <button key={d.id} type="button" onClick={() => toggleDept(d.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${f.departmentIds.includes(d.id) ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft hover:border-ink/30"}`}>
              {f.departmentIds.includes(d.id) && <Check size={13} className="mr-1 inline" />}{d.name}
            </button>
          ))}
        </div>
      </div>
      <div><Label>Cell *</Label>
        <Choice options={o.cells.map((c) => [c.id, c.name] as [string, string])} value={f.cellId} onChange={(v) => set({ cellId: v })} />
      </div>
      <div><Label>I identify as a *</Label>
        <Choice options={[["visitor", "Visitor"], ["actual_member", "Member"], ["associate", "Associate"], ["alumni", "Alumni"]]} value={f.membershipStatus} onChange={(v) => set({ membershipStatus: v })} />
      </div>
    </div>
  );
}

function StepSpiritual({ f, set }: { f: Form; set: (p: Partial<Form>) => void }) {
  return (
    <div className="space-y-5">
      <Toggle label="Have you received the Holy Ghost baptism?" on={f.holyGhostBaptism} onChange={(v) => set({ holyGhostBaptism: v })} />
      {f.holyGhostBaptism && <div><Label>When? (optional)</Label><input type="date" className="field" value={f.holyGhostBaptismDate} onChange={(e) => set({ holyGhostBaptismDate: e.target.value })} /></div>}
      <Toggle label="Have you been baptised in water?" on={f.waterBaptism} onChange={(v) => set({ waterBaptism: v })} />
      {f.waterBaptism && <div><Label>When? (optional)</Label><input type="date" className="field" value={f.waterBaptismDate} onChange={(e) => set({ waterBaptismDate: e.target.value })} /></div>}
    </div>
  );
}

function StepContact({ f, set }: { f: Form; set: (p: Partial<Form>) => void }) {
  const [same, setSame] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <Label>Active phone number *</Label>
        <input type="tel" inputMode="tel" className="field" value={f.phoneNumber} onChange={(e) => set({ phoneNumber: e.target.value })} placeholder="024 000 0000" />
        {f.phoneNumber.length > 0 && phoneDigits(f.phoneNumber).length !== 10 && (
          <p className="mt-1 text-xs text-clay">Phone number must be exactly 10 digits.</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={same} onChange={(e) => { setSame(e.target.checked); if (e.target.checked) set({ whatsappNumber: f.phoneNumber }); }} /> WhatsApp is the same as my phone
      </label>
      {!same && <div><Label>WhatsApp number</Label><input type="tel" inputMode="tel" className="field" value={f.whatsappNumber} onChange={(e) => set({ whatsappNumber: e.target.value })} /></div>}
    </div>
  );
}

function StepReview({ f, o, tsRef }: { f: Form; o: Options; tsRef: React.RefObject<HTMLDivElement> }) {
  const name = (arr: { id: string; name: string }[], id: string) => arr.find((x) => x.id === id)?.name ?? "—";
  const rows: [string, string][] = [
    ["Name", [f.firstName, f.otherNames, f.lastName].filter(Boolean).join(" ")],
    ["Programme", name(o.programmes, f.programmeId)],
    ["Residence", `${f.residenceStatus === "hostel_resident" ? "Hostel" : "Non-resident"} · ${f.residenceDetail}`],
    ["Cell", name(o.cells, f.cellId)],
    ["Departments", f.departmentIds.map((d) => name(o.departments, d)).join(", ") || "—"],
    ["Phone", f.phoneNumber],
  ];
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-ink/[0.07] rounded-xl border border-ink/10">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-ink-soft/60">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div ref={tsRef} className="flex justify-center" />
    </div>
  );
}

/* ---- small controls ---- */
function Choice({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${value === v ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft hover:border-ink/30"}`}>{l}</button>
      ))}
    </div>
  );
}
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between rounded-xl border border-ink/12 px-4 py-3.5 text-left">
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-gold" : "bg-ink/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.45rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Confirmation({ reference }: { reference: string }) {
  return (
    <div className="grain candlelight grid min-h-screen place-items-center bg-ivory px-5">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card max-w-md p-10 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-gold-soft to-gold text-vespers-deep"><PartyPopper size={30} /></div>
        <h1 className="font-display text-3xl font-semibold text-ink">Welcome to the family!</h1>
        <p className="mt-3 text-ink-soft/75">Your registration is in. A leader will review and approve it shortly.</p>
        <div className="mt-6 rounded-xl border border-gold/30 bg-gold/8 px-4 py-3">
          <div className="text-xs uppercase tracking-widest text-ink-soft/60">Your reference</div>
          <div className="font-display text-2xl font-semibold text-ink">{reference}</div>
        </div>
        <p className="mt-6 text-xs text-ink-soft/55">Next time you come to church, just give your name at the desk to be checked in.</p>
      </motion.div>
    </div>
  );
}
