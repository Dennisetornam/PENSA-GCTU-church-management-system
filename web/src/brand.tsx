// Brand marks. The official PENSA-GHANA × GCTU seal lives at /logo.png
// (served from web/public/logo.png).

export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="PENSA GCTU"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", display: "block" }}
    />
  );
}

export function Wordmark({ subtle = false }: { subtle?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5">
        <Logo size={38} />
      </span>
      <div className="leading-tight">
        <div className={`font-display text-lg font-semibold ${subtle ? "text-ivory-soft" : "text-ink"}`}>PENSA GCTU</div>
        <div className={`text-[0.62rem] uppercase tracking-[0.24em] ${subtle ? "text-ivory-soft/55" : "text-ink-soft/70"}`}>
          Church Management
        </div>
      </div>
    </div>
  );
}
