import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { Avatar, Badge, Spinner, Empty } from "../ui";
import { BulkMessageBar } from "./BulkMessage";

interface Officer {
  id: string; member_code: string | null; full_name: string; phone_number: string; whatsapp_number: string | null;
  officer_status: string; level: string | null; cell_name: string;
}

// Display order + labels for the officer offices.
const OFFICES: [string, string][] = [["elder", "Elders"], ["deacon", "Deacons"], ["deaconess", "Deaconesses"]];

export function Officers() {
  const { data, isLoading } = useQuery({ queryKey: ["officers"], queryFn: () => api.get<{ results: Officer[] }>("/api/officers") });
  const officers = data?.results ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Church register</div>
          <h1 className="font-display text-4xl font-semibold text-ink">Officers</h1>
        </div>
        {data && <Badge tone="gold">{officers.length} {officers.length === 1 ? "officer" : "officers"}</Badge>}
      </header>

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : officers.length === 0 ? (
        <Empty title="No officers yet" sub="Set a member's officer status (Deacon, Deaconess or Elder) on their profile to add them here." />
      ) : (
        <div className="space-y-8">
          {OFFICES.map(([key, title]) => {
            const group = officers.filter((o) => o.officer_status === key);
            if (group.length === 0) return null;
            return (
              <section key={key}>
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-gold" />
                  <h2 className="font-display text-2xl text-ink">{title}</h2>
                  <Badge tone="sage">{group.length}</Badge>
                </div>
                <BulkMessageBar recipients={group} context={`${group.length} ${title.toLowerCase()}`} />
                <div className="card divide-y divide-ink/[0.06] overflow-hidden">
                  {group.map((o) => (
                    <Link key={o.id} to={`/dashboard/members/${o.id}`} className="flex items-center gap-4 p-4 transition hover:bg-ink/[0.03]">
                      <Avatar name={o.full_name} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink">{o.full_name}</div>
                        <div className="text-sm text-ink-soft/55">{o.cell_name} · {o.phone_number}</div>
                      </div>
                      {o.level && <Badge tone="ink">Level {o.level}</Badge>}
                      <ChevronRight size={18} className="text-ink-soft/35" />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
