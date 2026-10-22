// Department Head portal — everything is scoped to the head's own department(s).
// A department with a gender_scope (Gents/Ladies wing) has no joined members;
// its "roster" is every member of that gender.

function inClause(ids: string[]): string {
  return ids.map(() => "?").join(",");
}

interface DeptRow { id: string; gender_scope: string | null }

async function headDeptRows(db: D1Database, deptIds: string[]): Promise<DeptRow[]> {
  if (deptIds.length === 0) return [];
  const { results } = await db
    .prepare(`SELECT id, gender_scope FROM departments WHERE id IN (${inClause(deptIds)}) AND deleted_at IS NULL`)
    .bind(...deptIds)
    .all<DeptRow>();
  return results ?? [];
}

/** The head's departments with member counts (gender-based for wings). */
export async function getHeadDepartments(db: D1Database, deptIds: string[]) {
  if (deptIds.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT d.id, d.name, d.gender_scope,
              CASE WHEN d.gender_scope IS NOT NULL
                THEN (SELECT COUNT(*) FROM members m WHERE m.gender = d.gender_scope AND m.deleted_at IS NULL AND m.registration_status = 'approved')
                ELSE (SELECT COUNT(*) FROM member_departments md JOIN members m ON m.id = md.member_id
                      WHERE md.department_id = d.id AND m.deleted_at IS NULL AND m.registration_status = 'approved')
              END AS member_count
       FROM departments d
       WHERE d.id IN (${inClause(deptIds)}) AND d.deleted_at IS NULL
       ORDER BY d.name COLLATE NOCASE`,
    )
    .bind(...deptIds)
    .all();
  return results ?? [];
}

/** The head's members (across their departments) + a read-only attendance summary. */
export async function getHeadMembers(db: D1Database, deptIds: string[]) {
  if (deptIds.length === 0) return [];
  const rows = await headDeptRows(db, deptIds);
  const normalIds = rows.filter((r) => !r.gender_scope).map((r) => r.id);
  const genders = [...new Set(rows.filter((r) => r.gender_scope).map((r) => r.gender_scope!))];
  if (normalIds.length === 0 && genders.length === 0) return [];

  const clauses: string[] = [];
  const args: unknown[] = [];
  if (normalIds.length) {
    clauses.push(`EXISTS (SELECT 1 FROM member_departments md WHERE md.member_id = m.id AND md.department_id IN (${inClause(normalIds)}))`);
    args.push(...normalIds);
  }
  if (genders.length) {
    clauses.push(`m.gender IN (${inClause(genders)})`);
    args.push(...genders);
  }
  const attended = "ar.status IN ('present','late') AND s.deleted_at IS NULL";
  const { results } = await db
    .prepare(
      `SELECT m.id, m.member_code, m.full_name, m.phone_number, m.whatsapp_number, m.level, m.gender,
              (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
                 WHERE ar.member_id = m.id AND ${attended}) AS attended_count,
              (SELECT MAX(s.session_date) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
                 WHERE ar.member_id = m.id AND ${attended}) AS last_attended
       FROM members m
       WHERE m.deleted_at IS NULL AND m.registration_status = 'approved' AND (${clauses.join(" OR ")})
       ORDER BY m.last_name COLLATE NOCASE, m.first_name COLLATE NOCASE`,
    )
    .bind(...args)
    .all();
  return results ?? [];
}
