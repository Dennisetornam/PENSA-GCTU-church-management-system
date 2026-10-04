// Departmental semester reports: periods + per-department submissions.

export interface NewPeriod {
  name: string;
  academicYear?: string | null;
  term?: string | null;
  dueDate?: string | null;
  createdBy: string | null;
}

export async function createPeriod(db: D1Database, p: NewPeriod): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO report_periods (id, name, academic_year, term, due_date, status, created_by, created_at)
       VALUES (?,?,?,?,?, 'open', ?, datetime('now'))`,
    )
    .bind(id, p.name, p.academicYear ?? null, p.term ?? null, p.dueDate ?? null, p.createdBy)
    .run();
  return { id };
}

export async function listPeriods(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT pr.id, pr.name, pr.academic_year, pr.term, pr.due_date, pr.status, pr.created_at, pr.closed_at,
              (SELECT COUNT(*) FROM department_reports dr WHERE dr.period_id = pr.id) AS submitted_count,
              (SELECT COUNT(*) FROM departments d WHERE d.deleted_at IS NULL AND d.is_active = 1) AS department_count
       FROM report_periods pr ORDER BY pr.created_at DESC`,
    )
    .all();
  return { results: results ?? [] };
}

export async function closePeriod(db: D1Database, id: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE report_periods SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'open'")
    .bind(id)
    .run();
  return !!res.meta.changes;
}

export async function reopenPeriod(db: D1Database, id: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE report_periods SET status = 'open', closed_at = NULL WHERE id = ? AND status = 'closed'")
    .bind(id)
    .run();
  return !!res.meta.changes;
}

export async function getPeriod(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM report_periods WHERE id = ? LIMIT 1").bind(id).first();
}

/** The status board: every active department for a period, with its report (or null) + the head's contact. */
export async function getPeriodBoard(db: D1Database, periodId: string) {
  const { results } = await db
    .prepare(
      `SELECT d.id AS department_id, d.name AS department_name,
              dr.id AS report_id, dr.file_name, dr.summary, dr.submitted_at,
              u.full_name AS submitted_by_name,
              m.full_name AS head_name, m.phone_number AS head_phone, m.whatsapp_number AS head_whatsapp
       FROM departments d
       LEFT JOIN department_reports dr ON dr.department_id = d.id AND dr.period_id = ?
       LEFT JOIN users u ON u.id = dr.submitted_by
       LEFT JOIN members m ON m.id = d.leader_member_id AND m.deleted_at IS NULL
       WHERE d.deleted_at IS NULL AND d.is_active = 1
       ORDER BY d.name COLLATE NOCASE`,
    )
    .bind(periodId)
    .all();
  return results ?? [];
}

export async function submitReport(
  db: D1Database,
  p: { periodId: string; departmentId: string; fileKey?: string | null; fileName?: string | null; summary?: string | null; submittedBy: string | null },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO department_reports (id, period_id, department_id, file_key, file_name, summary, submitted_by, submitted_at, updated_at)
       VALUES (?,?,?,?,?,?,?, datetime('now'), datetime('now'))
       ON CONFLICT (period_id, department_id) DO UPDATE SET
         file_key = excluded.file_key, file_name = excluded.file_name, summary = excluded.summary,
         submitted_by = excluded.submitted_by, updated_at = datetime('now')`,
    )
    .bind(id, p.periodId, p.departmentId, p.fileKey ?? null, p.fileName ?? null, p.summary ?? null, p.submittedBy)
    .run();
  return { id };
}

export async function getReport(db: D1Database, id: string) {
  return db
    .prepare("SELECT id, period_id, department_id, file_key, file_name FROM department_reports WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ id: string; period_id: string; department_id: string; file_key: string | null; file_name: string | null }>();
}

/** For a department head: the open period (if any) + which of their departments have/haven't submitted. */
export async function getMySubmissions(db: D1Database, departmentIds: string[]) {
  const open = await db.prepare("SELECT * FROM report_periods WHERE status = 'open' ORDER BY created_at DESC LIMIT 1").first<{ id: string }>();
  if (!open || departmentIds.length === 0) return { period: open ?? null, departments: [] as unknown[] };
  const placeholders = departmentIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT d.id AS department_id, d.name AS department_name,
              dr.id AS report_id, dr.file_name, dr.summary, dr.submitted_at
       FROM departments d
       LEFT JOIN department_reports dr ON dr.department_id = d.id AND dr.period_id = ?
       WHERE d.id IN (${placeholders}) AND d.deleted_at IS NULL
       ORDER BY d.name COLLATE NOCASE`,
    )
    .bind(open.id, ...departmentIds)
    .all();
  return { period: open, departments: results ?? [] };
}
