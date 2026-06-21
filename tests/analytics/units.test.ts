import { describe, it, expect, beforeEach } from "vitest";
import {
  getSummary, getDistribution, getBaptism, getUnbaptized, getAttendanceTrend, getGrowth, buildMembershipSnapshot, getPersonalityOfWeek,
} from "../../src/analytics/repository";
import { createSession, markAttendance, closeSession } from "../../src/attendance/repository";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const NOW = new Date("2026-06-04T12:00:00Z");

async function addMember(
  env: TestEnv,
  id: string,
  opts: { status?: string; hgb?: number; wb?: number; residence?: string; cell?: string; programme?: string; approvedAt?: string },
) {
  await env.DB.prepare(
    `INSERT INTO members (id, first_name, last_name, phone_number, membership_status, holy_ghost_baptism, water_baptism,
       residence_status, cell_id, programme_id, registration_status, approved_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'approved', ?)`,
  ).bind(id, id, "X", `+2332000${id}`, opts.status ?? "visitor", opts.hgb ?? 0, opts.wb ?? 0,
    opts.residence ?? "non_resident", opts.cell ?? null, opts.programme ?? null, opts.approvedAt ?? null).run();
}

let env: TestEnv;
beforeEach(() => {
  env = makeTestEnv({ seed: true });
});

describe("Module 7 — analytics", () => {
  it("summary counts members by status and baptism, plus 90-day active", async () => {
    await addMember(env, "1", { status: "actual_member", hgb: 1, wb: 1, cell: "cell_dunamis" });
    await addMember(env, "2", { status: "actual_member", hgb: 1, wb: 0, cell: "cell_dunamis" });
    await addMember(env, "3", { status: "visitor", cell: "cell_moriah" });
    await addMember(env, "4", { status: "alumni" });
    // member 1 attended recently, member 4 long ago
    await env.DB.prepare("INSERT INTO member_attendance_monthly (member_id, year_month, present, last_attended_date) VALUES ('1','2026-06',1,'2026-06-01')").run();
    await env.DB.prepare("INSERT INTO member_attendance_monthly (member_id, year_month, present, last_attended_date) VALUES ('4','2026-01',1,'2026-01-01')").run();

    const s = await getSummary(env.DB as never, NOW);
    expect(s.total).toBe(4);
    expect(s.actualMembers).toBe(2);
    expect(s.visitors).toBe(1);
    expect(s.alumni).toBe(1);
    expect(s.holyGhostBaptized).toBe(2);
    expect(s.waterBaptized).toBe(1);
    expect(s.active90d).toBe(1); // only member 1 within 90 days of 2026-06-04
  });

  it("distribution by cell and department", async () => {
    await addMember(env, "1", { cell: "cell_dunamis" });
    await addMember(env, "2", { cell: "cell_dunamis" });
    await addMember(env, "3", { cell: "cell_moriah" });
    await env.DB.prepare("INSERT INTO member_departments (id, member_id, department_id, joined_at) VALUES ('md1','1','dept_media','t')").run();

    const cells = (await getDistribution(env.DB as never, "cell")) as { name: string; count: number }[];
    expect(cells.find((c) => c.name === "Dunamis")?.count).toBe(2);
    expect(cells.find((c) => c.name === "Moriah")?.count).toBe(1);

    const depts = (await getDistribution(env.DB as never, "department")) as { name: string; count: number }[];
    expect(depts.find((d) => d.name === "Media")?.count).toBe(1);
  });

  it("baptism statistics with percentages", async () => {
    await addMember(env, "1", { hgb: 1, wb: 1 });
    await addMember(env, "2", { hgb: 1, wb: 0 });
    await addMember(env, "3", { hgb: 0, wb: 0 });
    await addMember(env, "4", { hgb: 0, wb: 0 });
    const b = await getBaptism(env.DB as never);
    expect(b.total).toBe(4);
    expect(b.holyGhost).toBe(2);
    expect(b.holyGhostPct).toBe(50);
    expect(b.waterPct).toBe(25);
  });

  it("lists members yet to receive each baptism", async () => {
    await addMember(env, "1", { hgb: 1, wb: 1 });
    await addMember(env, "2", { hgb: 1, wb: 0 });
    await addMember(env, "3", { hgb: 0, wb: 0 });

    const hg = (await getUnbaptized(env.DB as never, "holy_ghost")) as { id: string }[];
    expect(hg.map((r) => r.id)).toEqual(["3"]); // only member 3 lacks Holy Ghost baptism

    const water = (await getUnbaptized(env.DB as never, "water")) as { id: string }[];
    expect(water.map((r) => r.id).sort()).toEqual(["2", "3"]); // members 2 and 3 lack water baptism
  });

  it("attendance trend reads from session summaries", async () => {
    await addMember(env, "1", { cell: "cell_dunamis" });
    const { id } = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    await markAttendance(env.DB as never, id, [{ memberId: "1", status: "present" }], "manual", null);
    await closeSession(env.DB as never, id);
    const trend = (await getAttendanceTrend(env.DB as never, {})) as { session_date: string; attended: number }[];
    expect(trend.length).toBe(1);
    expect(trend[0]!.attended).toBe(1);
  });

  it("personality of the week = most attendances in last 7 days", async () => {
    await addMember(env, "1", { cell: "cell_dunamis" });
    await addMember(env, "2", { cell: "cell_dunamis" });
    // member 1 attends 2 sessions, member 2 attends 1 — within last 7 days of NOW
    const s1 = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-01" });
    const s2 = await createSession(env.DB as never, { gatheringTypeId: "gt_midweek", sessionDate: "2026-06-03" });
    await markAttendance(env.DB as never, s1.id, [{ memberId: "1", status: "present" }, { memberId: "2", status: "present" }], "manual", null);
    await markAttendance(env.DB as never, s2.id, [{ memberId: "1", status: "present" }], "manual", null);
    const p = await getPersonalityOfWeek(env.DB as never, NOW);
    expect(p?.id).toBe("1");
    expect(p?.attendances).toBe(2);
  });

  it("personality tie-break: earliest check-in wins when attendance is equal", async () => {
    await addMember(env, "1", { cell: "cell_dunamis" });
    await addMember(env, "2", { cell: "cell_dunamis" });
    const s = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-01" });
    // both present once; member 2 checked in earlier
    env.DB.__raw.exec(`INSERT INTO attendance_records (id, session_id, member_id, status, checked_in_at) VALUES ('a1','${s.id}','1','present','2026-06-01T09:30:00Z')`);
    env.DB.__raw.exec(`INSERT INTO attendance_records (id, session_id, member_id, status, checked_in_at) VALUES ('a2','${s.id}','2','present','2026-06-01T08:00:00Z')`);
    const p = await getPersonalityOfWeek(env.DB as never, NOW);
    expect(p?.id).toBe("2");
  });

  it("personality ignores non-weekly gatherings (e.g. Outreach)", async () => {
    await addMember(env, "1", { cell: "cell_dunamis" });
    const s = await createSession(env.DB as never, { gatheringTypeId: "gt_outreach", sessionDate: "2026-06-02" });
    env.DB.__raw.exec(`INSERT INTO attendance_records (id, session_id, member_id, status, checked_in_at) VALUES ('a1','${s.id}','1','present','2026-06-02T09:00:00Z')`);
    const p = await getPersonalityOfWeek(env.DB as never, NOW);
    expect(p).toBeNull();
  });

  it("growth snapshot builds and reads idempotently", async () => {
    await addMember(env, "1", { status: "actual_member", hgb: 1, residence: "hostel_resident", approvedAt: "2026-06-04T09:00:00Z" });
    await addMember(env, "2", { status: "visitor", residence: "non_resident" });
    await buildMembershipSnapshot(env.DB as never, "2026-06-04", NOW);
    await buildMembershipSnapshot(env.DB as never, "2026-06-04", NOW); // idempotent

    const growth = (await getGrowth(env.DB as never)) as { snapshot_date: string; total: number; new_approved: number; hostel_resident: number }[];
    expect(growth.length).toBe(1);
    expect(growth[0]!.total).toBe(2);
    expect(growth[0]!.new_approved).toBe(1);
    expect(growth[0]!.hostel_resident).toBe(1);
  });
});
