import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Spinner, Badge } from "../ui";

interface Dist { results: { id: string; name: string; count: number }[]; }

function GroupGrid({ title, eyebrow, dimension, blurb }: { title: string; eyebrow: string; dimension: string; blurb: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["dist", dimension], queryFn: () => api.get<Dist>(`/api/analytics/distribution?dimension=${dimension}`) });
  const items = data?.results ?? [];
  const total = items.reduce((a, c) => a + c.count, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-7 flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">{eyebrow}</div>
          <h1 className="font-display text-4xl font-semibold text-ink">{title}</h1>
          <p className="mt-2 text-ink-soft/70">{blurb}</p>
        </div>
        <Badge tone="gold">{total} placed</Badge>
      </header>
      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <div key={g.id} className="card p-5">
              <div className="font-display text-xl text-ink">{g.name}</div>
              <div className="mt-3 flex items-end gap-1.5">
                <span className="font-display text-4xl font-semibold text-gold">{g.count}</span>
                <span className="mb-1 text-sm text-ink-soft/60">members</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const Departments = () => (
  <GroupGrid title="Departments" eyebrow="Service" dimension="department" blurb="Where members serve the body." />
);
export const Cells = () => (
  <GroupGrid title="Cells" eyebrow="Community" dimension="cell" blurb="Smaller circles where the body gathers." />
);
