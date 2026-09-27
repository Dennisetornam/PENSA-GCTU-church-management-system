import { Sprout, Clock } from "lucide-react";

// PENSA Discipleship Program. The flow (disciples chosen at reopening, then
// students allocated to disciples) starts once the disciples are selected, so
// this is a placeholder until we wire up the real structure.
export function PDP() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="eyebrow mb-2">Discipleship</div>
      <h1 className="font-display text-4xl font-semibold text-ink">PENSA Discipleship Program</h1>

      <div className="card mt-8 flex flex-col items-center gap-4 p-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-gold/12 text-gold"><Sprout size={30} /></div>
        <h2 className="font-display text-2xl text-ink">Coming soon</h2>
        <p className="max-w-md text-ink-soft/75">
          Discipleship tracking opens once school reopens and the disciples have been chosen. After that,
          students are allocated to their disciples and we'll turn on enrolment, allocations and progress here.
        </p>
        <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-ink/[0.05] px-3.5 py-1.5 text-sm text-ink-soft/70">
          <Clock size={14} /> Being prepared
        </div>
      </div>
      <div className="gold-rule mx-auto mt-8 max-w-xs" />
    </div>
  );
}
