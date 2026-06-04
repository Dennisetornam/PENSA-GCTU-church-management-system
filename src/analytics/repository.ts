// Analytics queries. Current KPIs = indexed GROUP-BY; trends = rollup/snapshot
// tables. Date-dependent calls accept `now` for deterministic testing.

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface Summary {
  total: number;
  actualMembers: number;
  visitors: number;
  associates: number;
  alumni: number;
  active90d: number;
  holyGhostBaptized: number;
  waterBaptized: number;
}

export async function getSummary(db: D1Database, now: Date = new Date()): Promise<Summary> {
  const base = "FROM members WHERE deleted_at IS NULL AND registration_status='approved'";
  const row = await db
    .prepare(
      `SELECT
         count(*) AS total,
         sum(CASE WHEN membership_status='actual_member' THEN 1 ELSE 0 END) AS actual_members,
         sum(CASE WHEN membership_status='visitor' THEN 1 ELSE 0 END) AS visitors,
         sum(CASE WHEN membership_status='associate' THEN 1 ELSE 0 END) AS associates,
         sum(CASE WHEN membership_status='alumni' THEN 1 ELSE 0 END) AS alumni,
         sum(holy_ghost_baptism) AS hgb,
         sum(water_baptism) AS wb
       ${base}`,
    )
    .first<Record<string, number | null>>();

  const cutoff = daysAgo(now, 90);
  const active = await db
    .prepare("SELECT count(DISTINCT member_id) AS c FROM member_attendance_monthly WHERE last_attended_date >= ?")
    .bind(cutoff)
    .first<{ c: number }>();

  return {
    total: row?.total ?? 0,
    actualMembers: row?.actual_members ?? 0,
    visitors: row?.visitors ?? 0,
    associates: row?.associates ?? 0,
    alumni: row?.alumni ?? 0,
    active90d: active?.c ?? 0,
    holyGhostBaptized: row?.hgb ?? 0,
    waterBaptized: row?.wb ?? 0,
  };
}

export async function getDistribution(db: D1Database, dimension: "cell" | "department" | "programme") {
  let sql: string;
  if (dimension === "cell") {
    sql = `SELECT c.id, c.name, count(m.id) AS count FROM cells c
           LEFT JOIN members m ON m.cell_id = c.id AND m.deleted_at IS NULL AND m.registration_status='approved'
           WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.name`;
  } else if (dimension === "department") {
    sql = `SELECT d.id, d.name, count(md.member_id) AS count FROM departments d
           LEFT JOIN member_departments md ON md.department_id = d.id
           LEFT JOIN members m ON m.id = md.member_id AND m.deleted_at IS NULL
           WHERE d.deleted_at IS NULL GROUP BY d.id ORDER BY d.name`;
  } else {
    sql = `SELECT p.id, p.name, count(m.id) AS count FROM programmes p
           LEFT JOIN members m ON m.programme_id = p.id AND m.deleted_at IS NULL AND m.registration_status='approved'
           WHERE p.deleted_at IS NULL GROUP BY p.id HAVING count > 0 ORDER BY count DESC`;
  }
  const { results } = await db.prepare(sql).all();
  return results ?? [];
}

export async function getBaptism(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT count(*) AS total, sum(holy_ghost_baptism) AS holy_ghost, sum(water_baptism) AS water
       FROM members WHERE deleted_at IS NULL AND registration_status='approved'`,
    )
    .first<{ total: number; holy_ghost: number | null; water: number | null }>();
  const total = row?.total ?? 0;
  const holyGhost = row?.holy_ghost ?? 0;
  const water = row?.water ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return { total, holyGhost, water, holyGhostPct: pct(holyGhost), waterPct: pct(water) };
}

export async function getAttendanceTrend(db: D1Database, p: { gatheringTypeId?: string; limit?: number }) {
  const limit = Math.min(365, Math.max(1, p.limit ?? 90));
  const where = ["su.session_id IS NOT NULL"];
  const args: unknown[] = [];
  if (p.gatheringTypeId) {
    where.push("s.gathering_type_id = ?");
    args.push(p.gatheringTypeId);
  }
  const { results } = await db
    .prepare(
      `SELECT s.session_date, gt.name AS gathering, su.present, su.late, su.excused, su.attended, su.eligible_count
       FROM attendance_session_summary su
       JOIN attendance_sessions s ON s.id = su.session_id
       JOIN gathering_types gt ON gt.id = s.gathering_type_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.session_date DESC LIMIT ?`,
    )
    .bind(...args, limit)
    .all();
  return results ?? [];
}

export async function getGrowth(db: D1Database, p: { limit?: number } = {}) {
  const limit = Math.min(730, Math.max(1, p.limit ?? 180));
  const { results } = await db
    .prepare("SELECT * FROM membership_snapshots ORDER BY snapshot_date DESC LIMIT ?")
    .bind(limit)
    .all();
  return (results ?? []).reverse();
}

/** Build (or refresh) the membership snapshot for a date. Idempotent. */
export async function buildMembershipSnapshot(db: D1Database, date: string, now: Date = new Date()): Promise<void> {
  const s = await getSummary(db, now);
  const res = await db
    .prepare(
      `SELECT
         sum(CASE WHEN residence_status='hostel_resident' THEN 1 ELSE 0 END) AS hostel,
         sum(CASE WHEN residence_status='non_resident' THEN 1 ELSE 0 END) AS nonres,
         sum(CASE WHEN substr(approved_at,1,10)=? THEN 1 ELSE 0 END) AS new_approved
       FROM members WHERE deleted_at IS NULL AND registration_status='approved'`,
    )
    .bind(date)
    .first<{ hostel: number | null; nonres: number | null; new_approved: number | null }>();

  await db
    .prepare(
      `INSERT INTO membership_snapshots
         (snapshot_date, total, actual_members, visitors, associates, alumni, active_90d,
          hostel_resident, non_resident, holy_ghost_baptized, water_baptized, new_approved)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(snapshot_date) DO UPDATE SET total=excluded.total, actual_members=excluded.actual_members,
         visitors=excluded.visitors, associates=excluded.associates, alumni=excluded.alumni,
         active_90d=excluded.active_90d, hostel_resident=excluded.hostel_resident, non_resident=excluded.non_resident,
         holy_ghost_baptized=excluded.holy_ghost_baptized, water_baptized=excluded.water_baptized,
         new_approved=excluded.new_approved`,
    )
    .bind(
      date, s.total, s.actualMembers, s.visitors, s.associates, s.alumni, s.active90d,
      res?.hostel ?? 0, res?.nonres ?? 0, s.holyGhostBaptized, s.waterBaptized, res?.new_approved ?? 0,
    )
    .run();
}
