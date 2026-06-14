import { describe, it, expect, beforeEach } from "vitest";
import { signMemberQr, verifyMemberQr } from "../../src/attendance/qr";
import {
  createSession, markAttendance, closeSession, checkInByQr, getMemberAttendance, NotFoundError, ConflictError,
} from "../../src/attendance/repository";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const SECRET = "qr-secret-at-least-32-bytes-long-xxxxx";

async function seedMembers(env: TestEnv, n: number) {
  for (let i = 1; i <= n; i++) {
    await env.DB.prepare(
      "INSERT INTO members (id, first_name, last_name, phone_number, cell_id, registration_status, qr_version) VALUES (?,?,?,?,?, 'approved', 1)",
    ).bind(`m${i}`, `First${i}`, `Last${i}`, `+23320000000${i}`, "cell_dunamis").run();
  }
}

let env: TestEnv;
beforeEach(() => {
  env = makeTestEnv({ seed: true });
});

describe("Module 6 — QR tokens", () => {
  it("signs and verifies a member QR; rejects tampering", async () => {
    const token = await signMemberQr("m1", 1, SECRET);
    expect(await verifyMemberQr(token, SECRET)).toEqual({ memberId: "m1", qrVersion: 1 });
    expect(await verifyMemberQr(token + "x", SECRET)).toBeNull();
    expect(await verifyMemberQr(token, "other-secret")).toBeNull();
  });
});

describe("Module 6 — sessions & marking", () => {
  beforeEach(() => seedMembers(env, 4));

  it("creates a session and dedupes the same gathering+date", async () => {
    const a = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    expect(a.reused).toBe(false);
    const b = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    expect(b.reused).toBe(true);
    expect(b.id).toBe(a.id);
  });

  it("stores present/late/excused but treats absent as no row (sparse)", async () => {
    const { id } = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    await markAttendance(env.DB as never, id, [
      { memberId: "m1", status: "present" },
      { memberId: "m2", status: "late" },
      { memberId: "m3", status: "excused" },
      { memberId: "m4", status: "absent" },
    ], "manual", null);
    const rows = env.DB.__raw.prepare("SELECT count(*) c FROM attendance_records WHERE session_id = ?").get(id) as { c: number };
    expect(rows.c).toBe(3); // absent stored no row
  });

  it("is idempotent — re-marking updates instead of duplicating", async () => {
    const { id } = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    await markAttendance(env.DB as never, id, [{ memberId: "m1", status: "present" }], "manual", null);
    await markAttendance(env.DB as never, id, [{ memberId: "m1", status: "late" }], "manual", null);
    const row = env.DB.__raw.prepare("SELECT status, row_version FROM attendance_records WHERE session_id=? AND member_id='m1'").get(id) as { status: string; row_version: number };
    expect(row.status).toBe("late");
    expect(row.row_version).toBe(2);
    // marking absent removes the row
    await markAttendance(env.DB as never, id, [{ memberId: "m1", status: "absent" }], "manual", null);
    const c = env.DB.__raw.prepare("SELECT count(*) c FROM attendance_records WHERE session_id=? AND member_id='m1'").get(id) as { c: number };
    expect(c.c).toBe(0);
  });

  it("cannot mark a closed session", async () => {
    const { id } = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    await closeSession(env.DB as never, id);
    await expect(markAttendance(env.DB as never, id, [{ memberId: "m1", status: "present" }], "manual", null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("close computes the session summary and per-member monthly rollup", async () => {
    const { id } = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    await markAttendance(env.DB as never, id, [
      { memberId: "m1", status: "present" },
      { memberId: "m2", status: "present" },
      { memberId: "m3", status: "late" },
      { memberId: "m4", status: "excused" },
    ], "manual", null);
    await closeSession(env.DB as never, id);

    const sum = env.DB.__raw.prepare("SELECT * FROM attendance_session_summary WHERE session_id=?").get(id) as Record<string, number>;
    expect(sum.present).toBe(2);
    expect(sum.late).toBe(1);
    expect(sum.excused).toBe(1);
    expect(sum.attended).toBe(3);
    expect(sum.eligible_count).toBe(4);

    const mm = env.DB.__raw.prepare("SELECT present, last_attended_date FROM member_attendance_monthly WHERE member_id='m1' AND year_month='2026-06'").get() as { present: number; last_attended_date: string };
    expect(mm.present).toBe(1);
    expect(mm.last_attended_date).toBe("2026-06-07");

    const session = env.DB.__raw.prepare("SELECT status FROM attendance_sessions WHERE id=?").get(id) as { status: string };
    expect(session.status).toBe("closed");
  });

  it("QR check-in marks present; rejects a revoked qr_version", async () => {
    const { id } = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    const token = await signMemberQr("m1", 1, env.JWT_SECRET);
    const res = await checkInByQr(env.DB as never, id, token, env.JWT_SECRET);
    expect(res.memberId).toBe("m1");
    const row = env.DB.__raw.prepare("SELECT status, method FROM attendance_records WHERE session_id=? AND member_id='m1'").get(id) as { status: string; method: string };
    expect(row.status).toBe("present");
    expect(row.method).toBe("qr");

    // revoke: bump qr_version → old token invalid
    env.DB.__raw.exec("UPDATE members SET qr_version = 2 WHERE id='m1'");
    await expect(checkInByQr(env.DB as never, id, token, env.JWT_SECRET)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("member attendance trend aggregates attended gatherings", async () => {
    const s1 = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    await markAttendance(env.DB as never, s1.id, [{ memberId: "m1", status: "present" }], "manual", null);
    const s2 = await createSession(env.DB as never, { gatheringTypeId: "gt_midweek", sessionDate: "2026-06-10" });
    await markAttendance(env.DB as never, s2.id, [{ memberId: "m1", status: "late" }], "manual", null);
    // an absent mark must NOT count toward attended (and is stored sparsely, i.e. no row)
    const s3 = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-14" });
    await markAttendance(env.DB as never, s3.id, [{ memberId: "m1", status: "absent" }], "manual", null);

    const hist = await getMemberAttendance(env.DB as never, "m1");
    expect(hist.totalAttended).toBe(2);            // present + late, absent excluded
    expect((hist.monthly as { year_month: string; attended: number }[])[0]).toEqual({ year_month: "2026-06", attended: 2 });
    const byG = hist.byGathering as { gathering: string; attended: number }[];
    expect(byG.find((g) => g.gathering === "Sunday Service")?.attended).toBe(1);
    expect(byG.find((g) => g.gathering === "Midweek Service")?.attended).toBe(1);
    expect((hist.recent as unknown[]).length).toBe(2);   // only the present + late marks are stored
  });
});
