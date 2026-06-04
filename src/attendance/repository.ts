// Attendance engine (raw D1). Sparse storage: present/late/excused are stored;
// 'absent' = no row. Rollups (session summary + member monthly) update on close.
import { verifyMemberQr } from "./qr";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

type Method = "manual" | "qr" | "kiosk" | "import";

export async function createSession(
  db: D1Database,
  input: { gatheringTypeId: string; sessionDate: string; title?: string; recordedBy?: string | null },
): Promise<{ id: string; reused: boolean }> {
  const existing = await db
    .prepare(
      "SELECT id FROM attendance_sessions WHERE gathering_type_id = ? AND session_date = ? AND status='open' AND deleted_at IS NULL LIMIT 1",
    )
    .bind(input.gatheringTypeId, input.sessionDate)
    .first<{ id: string }>();
  if (existing) return { id: existing.id, reused: true };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO attendance_sessions (id, gathering_type_id, title, session_date, status, recorded_by, created_at, updated_at) VALUES (?,?,?,?, 'open', ?, ?, ?)",
    )
    .bind(id, input.gatheringTypeId, input.title ?? null, input.sessionDate, input.recordedBy ?? null, now, now)
    .run();
  return { id, reused: false };
}

export async function listSessions(db: D1Database, p: { gatheringTypeId?: string; page?: number; limit?: number }) {
  const limit = Math.min(100, Math.max(1, p.limit ?? 25));
  const page = Math.max(1, p.page ?? 1);
  const where = ["s.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (p.gatheringTypeId) {
    where.push("s.gathering_type_id = ?");
    args.push(p.gatheringTypeId);
  }
  const { results } = await db
    .prepare(
      `SELECT s.id, s.gathering_type_id, gt.name AS gathering_name, s.title, s.session_date, s.status,
              su.present, su.late, su.excused, su.attended, su.eligible_count
       FROM attendance_sessions s
       JOIN gathering_types gt ON gt.id = s.gathering_type_id
       LEFT JOIN attendance_session_summary su ON su.session_id = s.id
       WHERE ${where.join(" AND ")}
       ORDER BY s.session_date DESC LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, (page - 1) * limit)
    .all();
  return { results: results ?? [], page, limit };
}

export async function getSession(db: D1Database, id: string) {
  const session = await db
    .prepare("SELECT * FROM attendance_sessions WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(id)
    .first();
  if (!session) return null;
  const summary = await db.prepare("SELECT * FROM attendance_session_summary WHERE session_id = ?").bind(id).first();
  return { ...session, summary: summary ?? null };
}

export async function getRoster(
  db: D1Database,
  sessionId: string,
  p: { cellId?: string; departmentId?: string; q?: string; page?: number; limit?: number },
) {
  const limit = Math.min(500, Math.max(1, p.limit ?? 200));
  const page = Math.max(1, p.page ?? 1);
  const where = ["m.deleted_at IS NULL", "m.registration_status = 'approved'"];
  const args: unknown[] = [sessionId];
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
  const { results } = await db
    .prepare(
      `SELECT m.id, m.member_code, m.full_name, m.cell_id, ar.status, ar.method
       FROM members m
       LEFT JOIN attendance_records ar ON ar.session_id = ? AND ar.member_id = m.id
       WHERE ${where.join(" AND ")}
       ORDER BY m.last_name, m.first_name LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, (page - 1) * limit)
    .all();
  return { results: results ?? [], page, limit };
}

async function assertOpen(db: D1Database, sessionId: string): Promise<void> {
  const s = await db.prepare("SELECT status FROM attendance_sessions WHERE id = ? AND deleted_at IS NULL").bind(sessionId).first<{ status: string }>();
  if (!s) throw new NotFoundError("session not found");
  if (s.status !== "open") throw new ConflictError("session is closed");
}

/** Idempotent upsert of a single mark. 'absent' removes the row (sparse storage). */
export async function markOne(
  db: D1Database,
  sessionId: string,
  memberId: string,
  status: "present" | "late" | "excused" | "absent",
  method: Method,
  recordedBy: string | null,
): Promise<void> {
  if (status === "absent") {
    await db.prepare("DELETE FROM attendance_records WHERE session_id = ? AND member_id = ?").bind(sessionId, memberId).run();
    return;
  }
  const now = new Date().toISOString();
  const checkedIn = status === "excused" ? null : now;
  await db
    .prepare(
      `INSERT INTO attendance_records (id, session_id, member_id, status, checked_in_at, method, recorded_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id, member_id) DO UPDATE SET
         status = excluded.status, checked_in_at = excluded.checked_in_at, method = excluded.method,
         recorded_by = excluded.recorded_by, updated_at = excluded.updated_at, row_version = row_version + 1`,
    )
    .bind(crypto.randomUUID(), sessionId, memberId, status, checkedIn, method, recordedBy, now, now)
    .run();
}

export async function markAttendance(
  db: D1Database,
  sessionId: string,
  marks: { memberId: string; status: "present" | "late" | "excused" | "absent" }[],
  method: Method,
  recordedBy: string | null,
): Promise<{ updated: number }> {
  await assertOpen(db, sessionId);
  for (const m of marks) await markOne(db, sessionId, m.memberId, m.status, method, recordedBy);
  return { updated: marks.length };
}

export async function checkInByQr(
  db: D1Database,
  sessionId: string,
  token: string,
  secret: string,
  method: Method = "qr",
): Promise<{ memberId: string; memberCode: string | null }> {
  const decoded = await verifyMemberQr(token, secret);
  if (!decoded) throw new NotFoundError("invalid token");
  const member = await db
    .prepare("SELECT id, member_code, qr_version FROM members WHERE id = ? AND deleted_at IS NULL")
    .bind(decoded.memberId)
    .first<{ id: string; member_code: string | null; qr_version: number }>();
  if (!member || member.qr_version !== decoded.qrVersion) throw new NotFoundError("invalid or revoked QR");
  await assertOpen(db, sessionId);
  await markOne(db, sessionId, member.id, "present", method, null);
  return { memberId: member.id, memberCode: member.member_code };
}

/** Finalize a session: compute summary + per-member monthly rollups, then close. */
export async function closeSession(db: D1Database, sessionId: string): Promise<void> {
  await assertOpen(db, sessionId);
  const session = await db.prepare("SELECT session_date FROM attendance_sessions WHERE id = ?").bind(sessionId).first<{ session_date: string }>();
  const yearMonth = (session?.session_date ?? "").slice(0, 7);

  const counts = await db
    .prepare(
      `SELECT
         sum(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
         sum(CASE WHEN status='late' THEN 1 ELSE 0 END) AS late,
         sum(CASE WHEN status='excused' THEN 1 ELSE 0 END) AS excused
       FROM attendance_records WHERE session_id = ?`,
    )
    .bind(sessionId)
    .first<{ present: number | null; late: number | null; excused: number | null }>();
  const present = counts?.present ?? 0, late = counts?.late ?? 0, excused = counts?.excused ?? 0;

  const eligible = await db
    .prepare("SELECT count(*) AS c FROM members WHERE deleted_at IS NULL AND registration_status='approved'")
    .first<{ c: number }>();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO attendance_session_summary (session_id, eligible_count, present, late, excused, attended, finalized_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET eligible_count=excluded.eligible_count, present=excluded.present,
         late=excluded.late, excused=excluded.excused, attended=excluded.attended, finalized_at=excluded.finalized_at`,
    )
    .bind(sessionId, eligible?.c ?? 0, present, late, excused, present + late, now)
    .run();

  // Per-member monthly rollups (one row per attender of this session)
  const { results } = await db
    .prepare("SELECT member_id, status FROM attendance_records WHERE session_id = ?")
    .bind(sessionId)
    .all<{ member_id: string; status: string }>();
  for (const r of results ?? []) {
    const p = r.status === "present" ? 1 : 0;
    const l = r.status === "late" ? 1 : 0;
    const e = r.status === "excused" ? 1 : 0;
    const lastDate = p || l ? session?.session_date ?? null : null;
    await db
      .prepare(
        `INSERT INTO member_attendance_monthly (member_id, year_month, present, late, excused, last_attended_date)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(member_id, year_month) DO UPDATE SET
           present = present + excluded.present, late = late + excluded.late, excused = excused + excluded.excused,
           last_attended_date = max(coalesce(last_attended_date,''), coalesce(excluded.last_attended_date,''))`,
      )
      .bind(r.member_id, yearMonth, p, l, e, lastDate)
      .run();
  }

  await db.prepare("UPDATE attendance_sessions SET status='closed', updated_at=? WHERE id=?").bind(now, sessionId).run();
}

export async function getMemberAttendance(db: D1Database, memberId: string) {
  const { results: monthly } = await db
    .prepare("SELECT year_month, present, late, excused, last_attended_date FROM member_attendance_monthly WHERE member_id = ? ORDER BY year_month DESC")
    .bind(memberId)
    .all();
  const { results: recent } = await db
    .prepare(
      `SELECT s.session_date, gt.name AS gathering, ar.status
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       JOIN gathering_types gt ON gt.id = s.gathering_type_id
       WHERE ar.member_id = ? ORDER BY s.session_date DESC LIMIT 20`,
    )
    .bind(memberId)
    .all();
  return { monthly: monthly ?? [], recent: recent ?? [] };
}
