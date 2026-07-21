import { useState, type ReactNode, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Password input with a built-in show/hide toggle. Spreads any input props. */
export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} autoCapitalize="none" spellCheck={false} className={`field pr-11 ${className}`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-soft/50 transition hover:text-ink"
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

const TONES: Record<string, string> = {
  gold: "bg-gold/12 text-[#8a6a25] border-gold/25",
  sage: "bg-sage/15 text-[#4d5645] border-sage/30",
  clay: "bg-clay/12 text-clay border-clay/25",
  ink: "bg-ink/[0.06] text-ink-soft border-ink/12",
  vespers: "bg-vespers/10 text-vespers border-vespers/20",
};
export function Badge({ children, tone = "ink" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StatCard({
  label, value, hint, accent = false, icon,
}: { label: string; value: ReactNode; hint?: string; accent?: boolean; icon?: ReactNode }) {
  return (
    <div className={`card relative overflow-hidden p-5 ${accent ? "bg-vespers text-ivory-soft border-vespers" : ""}`}>
      {accent && <div className="candlelight absolute inset-0 opacity-60" />}
      <div className="relative flex items-start justify-between">
        <div>
          <div className={`text-[0.7rem] font-semibold uppercase tracking-[0.18em] ${accent ? "text-gold-soft" : "text-ink-soft/70"}`}>
            {label}
          </div>
          <div className={`mt-2 font-display text-4xl font-semibold ${accent ? "text-ivory-soft" : "text-ink"}`}>{value}</div>
          {hint && <div className={`mt-1 text-xs ${accent ? "text-ivory-soft/65" : "text-ink-soft/65"}`}>{hint}</div>}
        </div>
        {icon && <span className={accent ? "text-gold-soft" : "text-gold"}>{icon}</span>}
      </div>
    </div>
  );
}

export function Avatar({ name, src }: { name: string; src?: string | null }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (src) return <img src={src} alt={name} className="h-10 w-10 rounded-full object-cover ring-1 ring-ink/10" />;
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-gold-soft to-gold text-sm font-semibold text-vespers-deep ring-1 ring-gold/30">
      {initials || "?"}
    </span>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="grid place-items-center rounded-xl2 border border-dashed border-ink/15 py-16 text-center">
      <div className="font-display text-xl text-ink">{title}</div>
      {sub && <div className="mt-1 text-sm text-ink-soft/70">{sub}</div>}
    </div>
  );
}
