// Brand marks. The official seal per campus lives in web/public:
//   GCTU  -> /logo.png     KNUST Obuasi -> /logo-knust.jpg
import { useCampus } from "./campus";

export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  const campus = useCampus();
  const src = campus.id === "knust" ? "/logo-knust.jpg" : "/logo.png";
  return (
    <img
      src={src}
      alt={campus.name}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", display: "block" }}
    />
  );
}

export function Wordmark({ subtle = false }: { subtle?: boolean }) {
  const campus = useCampus();
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5">
        <Logo size={38} />
      </span>
      <div className="leading-tight">
        <div className={`font-display text-lg font-semibold ${subtle ? "text-ivory-soft" : "text-ink"}`}>{campus.name}</div>
        <div className={`text-[0.62rem] uppercase tracking-[0.24em] ${subtle ? "text-ivory-soft/55" : "text-ink-soft/70"}`}>
          Church Management
        </div>
      </div>
    </div>
  );
}
