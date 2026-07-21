import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../auth";
import { Logo, Wordmark } from "../brand";
import { Spinner, PasswordInput } from "../ui";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      nav("/dashboard");
    } catch {
      setErr("Those credentials don't match our records.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grain min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Sanctuary panel */}
      <div className="relative hidden overflow-hidden bg-vespers-deep text-ivory-soft lg:block">
        <div className="candlelight absolute inset-0 animate-glow" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "26px 26px" }}
        />
        {/* large faded seal */}
        <div className="pointer-events-none absolute -right-32 top-1/2 hidden -translate-y-1/2 opacity-10 xl:block">
          <Logo size={560} />
        </div>
        <div className="relative flex h-full flex-col justify-between p-14">
          <Wordmark subtle />
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}>
            <div className="eyebrow mb-5">Welcome home</div>
            <h1 className="max-w-md font-display text-5xl font-semibold leading-[1.05] text-ivory-soft">
              Every member, <span className="italic text-gold-soft">known</span> &amp; cared for.
            </h1>
            <p className="mt-6 max-w-sm text-ivory-soft/70">
              The shepherd&apos;s desk for PENSA GCTU — registrations, attendance and the life of the fellowship, in one calm place.
            </p>
          </motion.div>
          <div className="flex items-center gap-3 text-sm text-ivory-soft/55">
            <div className="gold-rule w-12" />
            <span className="italic font-display">“So in Christ we, though many, form one body.”</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex min-h-screen items-center justify-center bg-ivory px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <div className="eyebrow mb-2">Administrator access</div>
          <h2 className="font-display text-3xl font-semibold text-ink">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-soft/70">Only leaders &amp; administrators sign in here.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email or username</label>
              <input id="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email}
                onChange={(e) => setEmail(e.target.value)} className="field" placeholder="you@pensagctu.org" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <PasswordInput id="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            </div>
            {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3.5 py-2.5 text-sm text-clay">{err}</div>}
            <button type="submit" disabled={busy} className="btn-gold w-full !py-3">
              {busy ? <Spinner /> : "Enter the desk"}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-3 text-xs text-ink-soft/55">
            <div className="gold-rule flex-1" />
            <span>PENSA GCTU · {new Date().getFullYear()}</span>
            <div className="gold-rule flex-1" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
