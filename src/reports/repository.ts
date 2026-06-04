// Report queries. Each returns a typed { title, columns, rows } shape that the
// route serializes to JSON / CSV / Excel.
import type { Column, Row } from "./format";

export interface Report {
  title: string;
  columns: Column[];
  rows: Row[];
}

export type ReportType = "members" | "attendance-summary" | "inactive-members";

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function membersReport(db: D1Database, p: { status?: string; cellId?: string }): Promise<Report> {
  const where = ["m.deleted_at IS NULL", "m.registration_status='approved'"];
  const args: unknown[] = [];
  if (p.status) {
    where.push("m.membership_status = ?");
    args.push(p.status);
  }
  if (p.cellId) {
    where.push("m.cell_id = ?");
    args.push(p.cellId);
  }
  const { results } = await db
    .prepare(
      `SELECT m.member_code, m.full_name, m.phone_number, c.name AS cell, m.membership_status
       FROM members m LEFT JOIN cells c ON c.id = m.cell_id
       WHERE ${where.join(" AND ")} ORDER BY m.last_name, m.first_name`,
    )
    .bind(...args)
    .all<Row>();
  return {
    title: "Members Roster",
    columns: [
      { key: "member_code", label: "Member ID" },
      { key: "full_name", label: "Name" },
      { key: "phone_number", label: "Phone" },
      { key: "cell", label: "Cell" },
      { key: "membership_status", label: "Status" },
    ],
    rows: results ?? [],
  };
}

async function attendanceSummaryReport(db: D1Database, p: { gatheringTypeId?: string }): Promise<Report> {
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
       WHERE ${where.join(" AND ")} ORDER BY s.session_date DESC`,
    )
    .bind(...args)
    .all<Record<string, number | string>>();
  const rows: Row[] = (results ?? []).map((r) => ({
    ...r,
    rate: Number(r.eligible_count) ? Math.round((Number(r.attended) / Number(r.eligible_count)) * 100) : 0,
  }));
  return {
    title: "Attendance Summary",
    columns: [
      { key: "session_date", label: "Date" },
      { key: "gathering", label: "Gathering" },
      { key: "present", label: "Present" },
      { key: "late", label: "Late" },
      { key: "excused", label: "Excused" },
      { key: "attended", label: "Attended" },
      { key: "eligible_count", label: "Eligible" },
      { key: "rate", label: "Rate %" },
    ],
    rows,
  };
}

async function inactiveMembersReport(db: D1Database, now: Date, days = 90): Promise<Report> {
  const cutoff = daysAgo(now, days);
  const { results } = await db
    .prepare(
      `SELECT m.member_code, m.full_name, m.phone_number, c.name AS cell
       FROM members m LEFT JOIN cells c ON c.id = m.cell_id
       WHERE m.deleted_at IS NULL AND m.registration_status='approved'
         AND m.id NOT IN (SELECT member_id FROM member_attendance_monthly WHERE last_attended_date >= ?)
       ORDER BY m.last_name, m.first_name`,
    )
    .bind(cutoff)
    .all<Row>();
  return {
    title: `Inactive Members (no attendance in ${days} days)`,
    columns: [
      { key: "member_code", label: "Member ID" },
      { key: "full_name", label: "Name" },
      { key: "phone_number", label: "Phone" },
      { key: "cell", label: "Cell" },
    ],
    rows: results ?? [],
  };
}

export async function getReport(
  db: D1Database,
  type: ReportType,
  params: Record<string, string | undefined>,
  now: Date = new Date(),
): Promise<Report | null> {
  switch (type) {
    case "members":
      return membersReport(db, { status: params.status, cellId: params.cellId });
    case "attendance-summary":
      return attendanceSummaryReport(db, { gatheringTypeId: params.gatheringTypeId });
    case "inactive-members":
      return inactiveMembersReport(db, now, params.days ? Number(params.days) : 90);
    default:
      return null;
  }
}
