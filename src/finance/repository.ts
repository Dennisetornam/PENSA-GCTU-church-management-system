// Finance: record giving per service. Money is stored in integer minor units.

export const CATEGORIES = ["offering_cash", "offering_momo", "tithe", "pledge", "fundraising", "free_will"] as const;
export const METHODS = ["cash", "momo", "bank", "card", "cheque"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface NewEntry {
  category: Category;
  amountMinor: number;
  currency: string;
  serviceTypeId?: string | null;
  paymentMethod?: string | null;
  occurredOn: string;
  recordedBy: string | null;
  notes?: string | null;
}

export async function createEntry(db: D1Database, e: NewEntry): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO finance_entries (id, category, amount_minor, currency, service_type_id, payment_method, occurred_on, recorded_by, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?, datetime('now'))`,
    )
    .bind(id, e.category, e.amountMinor, e.currency, e.serviceTypeId ?? null, e.paymentMethod ?? null, e.occurredOn, e.recordedBy, e.notes ?? null)
    .run();
  return { id };
}

export interface ListParams {
  category?: string;
  from?: string;
  to?: string;
  serviceTypeId?: string;
  page?: number;
  limit?: number;
}

export async function listEntries(db: D1Database, p: ListParams) {
  const limit = Math.min(200, Math.max(1, p.limit ?? 50));
  const page = Math.max(1, p.page ?? 1);
  const where = ["f.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (p.category) { where.push("f.category = ?"); args.push(p.category); }
  if (p.serviceTypeId) { where.push("f.service_type_id = ?"); args.push(p.serviceTypeId); }
  if (p.from) { where.push("f.occurred_on >= ?"); args.push(p.from); }
  if (p.to) { where.push("f.occurred_on <= ?"); args.push(p.to); }

  const { results } = await db
    .prepare(
      `SELECT f.id, f.category, f.amount_minor, f.currency, f.payment_method, f.occurred_on, f.notes,
              gt.name AS service_name, u.full_name AS recorded_by_name
       FROM finance_entries f
       LEFT JOIN gathering_types gt ON gt.id = f.service_type_id
       LEFT JOIN users u ON u.id = f.recorded_by
       WHERE ${where.join(" AND ")}
       ORDER BY f.occurred_on DESC, f.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, (page - 1) * limit)
    .all();
  return { results: results ?? [], page, limit };
}

export async function summary(db: D1Database, p: { from?: string; to?: string } = {}) {
  const where = ["deleted_at IS NULL"];
  const args: unknown[] = [];
  if (p.from) { where.push("occurred_on >= ?"); args.push(p.from); }
  if (p.to) { where.push("occurred_on <= ?"); args.push(p.to); }
  const { results } = await db
    .prepare(`SELECT category, sum(amount_minor) AS total_minor, count(*) AS n FROM finance_entries WHERE ${where.join(" AND ")} GROUP BY category`)
    .bind(...args)
    .all<{ category: string; total_minor: number; n: number }>();
  const byCategory: Record<string, { total_minor: number; n: number }> = {};
  let totalMinor = 0;
  for (const r of results ?? []) {
    byCategory[r.category] = { total_minor: r.total_minor, n: r.n };
    totalMinor += r.total_minor;
  }
  return { byCategory, totalMinor };
}
