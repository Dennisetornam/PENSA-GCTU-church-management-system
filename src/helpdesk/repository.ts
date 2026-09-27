// Members' Help Desk — public intake (may be anonymous) + admin triage.

export const HELP_CATEGORIES = ["enquiry", "assistance", "concern", "other"] as const;
export const HELP_STATUSES = ["open", "in_progress", "resolved"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface NewTicket {
  category: HelpCategory;
  subject?: string | null;
  message: string;
  isAnonymous: boolean;
  name?: string | null;
  contact?: string | null;
  memberId?: string | null;
}

const nz = (s: unknown) => (s && String(s).length > 0 ? String(s) : null);

/** Short, human-friendly reference the sender can quote when following up. */
function makeReference(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `HD-${n}`;
}

export async function createTicket(db: D1Database, t: NewTicket): Promise<{ id: string; reference: string }> {
  const id = crypto.randomUUID();
  const reference = makeReference();
  const anon = t.isAnonymous ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO help_desk_tickets (id, reference, category, subject, message, is_anonymous, name, contact, member_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?, datetime('now'), datetime('now'))`,
    )
    .bind(id, reference, t.category, nz(t.subject), t.message, anon, anon ? null : nz(t.name), anon ? null : nz(t.contact), nz(t.memberId))
    .run();
  return { id, reference };
}

export async function listTickets(db: D1Database, p: { status?: string; page?: number; limit?: number } = {}) {
  const limit = Math.min(200, Math.max(1, p.limit ?? 50));
  const page = Math.max(1, p.page ?? 1);
  const where: string[] = [];
  const args: unknown[] = [];
  if (p.status) { where.push("t.status = ?"); args.push(p.status); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { results } = await db
    .prepare(
      `SELECT t.id, t.reference, t.category, t.subject, t.message, t.is_anonymous, t.name, t.contact, t.member_id,
              t.status, t.admin_notes, t.created_at, t.updated_at, t.resolved_at, u.full_name AS handled_by_name
       FROM help_desk_tickets t
       LEFT JOIN users u ON u.id = t.handled_by
       ${whereSql}
       ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, t.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, (page - 1) * limit)
    .all();
  const counts = await db
    .prepare("SELECT status, COUNT(*) AS n FROM help_desk_tickets GROUP BY status")
    .all<{ status: string; n: number }>();
  const byStatus: Record<string, number> = { open: 0, in_progress: 0, resolved: 0 };
  for (const r of counts.results ?? []) byStatus[r.status] = Number(r.n);
  return { results: results ?? [], byStatus, page, limit };
}

export async function updateTicket(
  db: D1Database,
  id: string,
  p: { status?: string; adminNotes?: string | null; handledBy?: string | null },
): Promise<boolean> {
  const sets: string[] = ["updated_at = datetime('now')"];
  const args: unknown[] = [];
  if (p.status) {
    sets.push("status = ?");
    args.push(p.status);
    sets.push("resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END");
    args.push(p.status);
    sets.push("handled_by = ?");
    args.push(p.handledBy ?? null);
  }
  if (p.adminNotes !== undefined) { sets.push("admin_notes = ?"); args.push(nz(p.adminNotes)); }
  const res = await db.prepare(`UPDATE help_desk_tickets SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run();
  return !!res.meta.changes;
}
