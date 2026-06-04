// Brand marks: a pointed-arch monogram (church window) rendered in gold.
export function ArchMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path
        d="M24 3C14 3 9 11 9 21v22a2 2 0 0 0 2 2h26a2 2 0 0 0 2-2V21C39 11 34 3 24 3Z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path d="M24 12c-5 0-7 5-7 10v18h14V22c0-5-2-10-7-10Z" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <path d="M24 3v42M9 30h30" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <circle cx="24" cy="20" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ subtle = false }: { subtle?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={subtle ? "text-gold" : "text-gold"}>
        <ArchMark size={34} />
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
