// Member read/list queries + lifecycle status change. Search hits the indexed
// columns full_name / phone_number / member_code for fast lookup.

export interface MemberListParams {
  q?: string;
  status?: string;
  cellId?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export interface Paged<T> {
  results: T[];
  total: number;
  page: number;
  limit: number;
}

export async function listMembers(db: D1Database, p: MemberListParams): Promise<Paged<unknown>> {
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 25));
  const where: string[] = ["m.deleted_at IS NULL"];
  const args: unknown[] = [];

  if (p.status) {
    where.push("m.membership_status = ?");
    args.push(p.status);
  }
  if (p.cellId) {
    where.push("m.cell_id = ?");
    args.push(p.cellId);
  }
  if (p.departmentId) {
    where.push("EXISTS (SELECT 1 FROM member_departments md WHERE md.member_id = m.id AND md.department_id = ?)");
    args.push(p.departmentId);
  }
  if (p.q) {
    where.push("(m.full_name LIKE ? OR m.phone_number LIKE ? OR m.member_code LIKE ?)");
    const like = `%${p.q}%`;
    args.push(like, like, like);
  }
  const whereSql = where.join(" AND ");

  const totalRow = await db
    .prepare(`SELECT count(*) AS c FROM members m WHERE ${whereSql}`)
    .bind(...args)
    .first<{ c: number }>();

  const { results } = await db
    .prepare(
      `SELECT m.id, m.member_code, m.full_name, m.phone_number, m.whatsapp_number, m.cell_id,
              m.membership_status, m.profile_picture_key, m.created_at
       FROM members m WHERE ${whereSql}
       ORDER BY m.last_name, m.first_name
       LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, (page - 1) * limit)
    .all();

  return { results: results ?? [], total: totalRow?.c ?? 0, page, limit };
}

export async function getMember(db: D1Database, id: string): Promise<unknown | null> {
  const member = await db
    .prepare("SELECT * FROM members WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(id)
    .first();
  if (!member) return null;
  const { results: departments } = await db
    .prepare(
      `SELECT d.id, d.name FROM member_departments md JOIN departments d ON d.id = md.department_id
       WHERE md.member_id = ?`,
    )
    .bind(id)
    .all();
  return { ...member, departments: departments ?? [] };
}

export async function changeMemberStatus(
  db: D1Database,
  id: string,
  toStatus: string,
  reason: string | null,
  changedBy: string | null,
): Promise<void> {
  const current = await db
    .prepare("SELECT membership_status FROM members WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{ membership_status: string }>();
  if (!current) throw new Error("member not found");
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE members SET membership_status = ?, updated_at = ? WHERE id = ?")
    .bind(toStatus, now, id)
    .run();
  await db
    .prepare(
      `INSERT INTO membership_history (id, member_id, from_status, to_status, reason, changed_by, created_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, current.membership_status, toStatus, reason, changedBy, now)
    .run();
}
