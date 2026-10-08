// Department Head portal — everything is scoped to the head's own department(s).

function inClause(ids: string[]): string {
  return ids.map(() => "?").join(",");
}

/** The head's departments with member counts. */
export async function getHeadDepartments(db: D1Database, deptIds: string[]) {
  if (deptIds.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT d.id, d.name,
              (SELECT COUNT(*) FROM member_departments md JOIN members m ON m.id = md.member_id
               WHERE md.department_id = d.id AND m.deleted_at IS NULL AND m.registration_status = 'approved') AS member_count
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
  const attended = "ar.status IN ('present','late') AND s.deleted_at IS NULL";
  const { results } = await db
    .prepare(
      `SELECT m.id, m.member_code, m.full_name, m.phone_number, m.whatsapp_number, m.level,
              (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
                 WHERE ar.member_id = m.id AND ${attended}) AS attended_count,
              (SELECT MAX(s.session_date) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
                 WHERE ar.member_id = m.id AND ${attended}) AS last_attended,
              (SELECT GROUP_CONCAT(d2.name, ', ') FROM member_departments md2 JOIN departments d2 ON d2.id = md2.department_id
                 WHERE md2.member_id = m.id AND d2.id IN (${inClause(deptIds)})) AS departments
       FROM members m
       WHERE m.deleted_at IS NULL AND m.registration_status = 'approved'
         AND EXISTS (SELECT 1 FROM member_departments md WHERE md.member_id = m.id AND md.department_id IN (${inClause(deptIds)}))
       ORDER BY m.last_name COLLATE NOCASE, m.first_name COLLATE NOCASE`,
    )
    .bind(...deptIds, ...deptIds)
    .all();
  return results ?? [];
}
