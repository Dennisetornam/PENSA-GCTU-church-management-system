import { useState } from "react";
import { motion } from "motion/react";
import { LifeBuoy, Check, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { Wordmark } from "../brand";
import { Spinner } from "../ui";
import { useCampus } from "../campus";

const CATEGORIES: { key: string; label: string }[] = [
  { key: "enquiry", label: "Enquiry" },
  { key: "assistance", label: "Assistance" },
  { key: "concern", label: "Concern" },
  { key: "other", label: "Other" },
];

export function HelpDeskPublic() {
  const campus = useCampus();
  const [category, setCategory] = useState("enquiry");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [anon, setAnon] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true); setErr(null);
    try {
      const r = await api.post<{ reference: string }>("/help-desk/submit", {
        category, subject: subject.trim() || undefined, message: message.trim(),
        isAnonymous: anon, name: anon ? undefined : name.trim() || undefined, contact: anon ? undefined : contact.trim() || undefined,
      });
      setDone(r.reference);
    } catch {
      setErr("Sorry, that couldn't be sent. Please try again.");
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="grain candlelight grid min-h-screen place-items-center bg-ivory px-5">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card max-w-md p-10 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-gold-soft to-gold text-vespers-deep"><Check size={30} /></div>
          <h1 className="font-display text-3xl font-semibold text-ink">Message received</h1>
          <p className="mt-3 text-ink-soft/75">Thank you for reaching out. A leader will look into it.</p>
          <div className="mt-6 rounded-xl border border-gold/30 bg-gold/8 px-4 py-3">
            <div className="text-xs uppercase tracking-widest text-ink-soft/60">Your reference</div>
            <div className="font-display text-2xl font-semibold text-ink">{done}</div>
          </div>
          <p className="mt-6 text-xs text-ink-soft/55">Keep this reference if you'd like to follow up.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="grain candlelight min-h-screen bg-ivory">
      <div className="mx-auto max-w-xl px-5 py-8">
        <div className="mb-7 flex justify-center"><Wordmark /></div>
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-gold/12 text-gold"><LifeBuoy size={26} /></div>
          <h1 className="font-display text-3xl font-semibold text-ink">Help Desk</h1>
          <p className="mt-2 text-ink-soft/70">Ask a question, request help, or share something on your mind. We're listening.</p>
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <label className="label">What's this about?</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" onClick={() => setCategory(c.key)}
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${category === c.key ? "border-gold bg-gold/12 text-[#8a6a25]" : "border-ink/15 text-ink-soft hover:border-ink/30"}`}>{c.label}</button>
              ))}
            </div>
          </div>
          <div><label className="label">Subject (optional)</label><input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A short title" /></div>
          <div><label className="label">Your message *</label><textarea className="field min-h-32" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what's going on…" /></div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink/12 bg-ink/[0.02] px-3.5 py-3 text-sm text-ink">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
            <ShieldCheck size={16} className="text-[#4d5645]" />
            <span>Send anonymously <span className="text-ink-soft/60">— your name and contact won't be attached</span></span>
          </label>

          {!anon && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Your name (optional)</label><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label className="label">Phone / WhatsApp (optional)</label><input className="field" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="So we can reach you" /></div>
            </div>
          )}

          {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3.5 py-2.5 text-sm text-clay">{err}</div>}

          <button onClick={submit} disabled={message.trim().length < 5 || submitting} className="btn-gold w-full">{submitting ? <Spinner /> : "Send message"}</button>
        </div>
        <p className="mt-5 text-center text-xs text-ink-soft/50">{campus.name} · Members' Help Desk</p>
      </div>
    </div>
  );
}
