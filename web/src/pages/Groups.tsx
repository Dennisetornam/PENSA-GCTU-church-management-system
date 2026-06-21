import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Users2 } from "lucide-react";
import { api } from "../api";
import { Spinner, Badge, Avatar, Empty } from "../ui";
import { BulkMessageBar } from "./BulkMessage";

interface Dist { results: { id: string; name: string; count: number }[]; }
interface Options { departments: { id: string; name: string }[]; cells: { id: string; name: string }[]; }
interface MemberRow { id: string; member_code: string | null; full_name: string; phone_number: string; membership_status: string; }

const STATUS_TONE: Record<string, "gold" | "sage" | "clay" | "ink"> = { actual_member: "sage", visitor: "gold", associate: "clay", alumni: "ink" };
const lbl = (s: string) => s.replace("_", " ");

/* ── Grid of groups (clickable) ─────────────────────────────────────────── */
function GroupGrid({ title, eyebrow, dimension, basePath, blurb }: { title: string; eyebrow: string; dimension: string; basePath: string; blurb: string }) {
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
            <Link key={g.id} to={`${basePath}/${g.id}`} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex items-start justify-between">
                <div className="font-display text-xl text-ink">{g.name}</div>
                <ChevronRight size={18} className="text-ink-soft/35" />
              </div>
              <div className="mt-3 flex items-end gap-1.5">
                <span className="font-display text-4xl font-semibold text-gold">{g.count}</span>
                <span className="mb-1 text-sm text-ink-soft/60">members</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export const Departments = () => (
  <GroupGrid title="Departments" eyebrow="Service" dimension="department" basePath="/dashboard/departments" blurb="Where members serve the body. Tap one to see its roster." />
);
export const Cells = () => (
  <GroupGrid title="Cells" eyebrow="Community" dimension="cell" basePath="/dashboard/cells" blurb="Smaller circles where the body gathers. Tap one to see its members." />
);

/* ── Roster of one group ────────────────────────────────────────────────── */
function GroupMembers({ dimension }: { dimension: "cell" | "department" }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: opts } = useQuery({ queryKey: ["options"], queryFn: () => api.get<Options>("/register/options") });
  const groupList = dimension === "cell" ? opts?.cells : opts?.departments;
  const name = groupList?.find((g) => g.id === id)?.name ?? (dimension === "cell" ? "Cell" : "Department");
  const query = dimension === "cell" ? `cellId=${id}` : `departmentId=${id}`;
  const { data, isLoading } = useQuery({ queryKey: ["group-members", dimension, id], queryFn: () => api.get<{ results: MemberRow[]; total: number }>(`/api/members?${query}&limit=200`) });
  const rows = data?.results ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => nav(dimension === "cell" ? "/dashboard/cells" : "/dashboard/departments")} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft/60 hover:text-ink">
        <ArrowLeft size={15} /> {dimension === "cell" ? "Cells" : "Departments"}
      </button>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">{dimension === "cell" ? "Cell" : "Department"}</div>
          <h1 className="font-display text-4xl font-semibold text-ink">{name}</h1>
        </div>
        <Badge tone="gold"><Users2 size={13} /> {data?.total ?? 0} members</Badge>
      </header>

      {isLoading ? (
        <div className="grid h-24 place-items-center text-ink-soft/50"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title="No members yet" sub={`No members are assigned to this ${dimension}.`} />
      ) : (
        <>
        <BulkMessageBar recipients={rows} context={name} />
        <div className="card divide-y divide-ink/[0.06]">
          {rows.map((m) => (
            <Link key={m.id} to={`/dashboard/members/${m.id}`} className="flex items-center gap-4 p-4 transition hover:bg-ink/[0.03]">
              <Avatar name={m.full_name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{m.full_name}</div>
                <div className="text-sm text-ink-soft/55">{m.member_code ?? "—"} · {m.phone_number}</div>
              </div>
              <Badge tone={STATUS_TONE[m.membership_status] ?? "ink"}>{lbl(m.membership_status)}</Badge>
              <ChevronRight size={18} className="text-ink-soft/35" />
            </Link>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

export const CellMembers = () => <GroupMembers dimension="cell" />;
export const DepartmentMembers = () => <GroupMembers dimension="department" />;
