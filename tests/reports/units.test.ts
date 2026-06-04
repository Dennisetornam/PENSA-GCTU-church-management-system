import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { toCsv, toXlsx } from "../../src/reports/format";
import { getReport } from "../../src/reports/repository";
import { createSession, markAttendance, closeSession } from "../../src/attendance/repository";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const cols = [{ key: "a", label: "A" }, { key: "b", label: "B" }];

describe("Module 8 — serializers", () => {
  it("toCsv escapes commas, quotes and newlines", () => {
    const csv = toCsv(cols, [{ a: "hi, there", b: 'say "hello"' }, { a: "line\nbreak", b: 1 }]);
    expect(csv.split("\n")[0]).toBe("A,B");
    expect(csv).toContain('"hi, there"');
    expect(csv).toContain('"say ""hello"""');
  });
  it("toXlsx produces a readable workbook", () => {
    const buf = toXlsx("Sheet", cols, [{ a: "x", b: 2 }]);
    expect(buf.byteLength).toBeGreaterThan(0);
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    expect(ws["A1"].v).toBe("A");
    expect(ws["A2"].v).toBe("x");
  });
});

let env: TestEnv;
beforeEach(() => {
  env = makeTestEnv({ seed: true });
});

async function addMember(env: TestEnv, id: string, status = "visitor") {
  await env.DB.prepare(
    "INSERT INTO members (id, first_name, last_name, phone_number, membership_status, cell_id, registration_status) VALUES (?,?,?,?,?, 'cell_dunamis','approved')",
  ).bind(id, id, "X", `+2332000${id}`, status).run();
}

describe("Module 8 — report queries", () => {
  it("members roster report", async () => {
    await addMember(env, "1", "actual_member");
    await addMember(env, "2", "visitor");
    const r = await getReport(env.DB as never, "members", {});
    expect(r?.title).toBe("Members Roster");
    expect(r?.rows.length).toBe(2);
    expect(r?.columns[0]!.label).toBe("Member ID");
  });

  it("attendance summary report computes rate", async () => {
    await addMember(env, "1");
    const { id } = await createSession(env.DB as never, { gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" });
    await markAttendance(env.DB as never, id, [{ memberId: "1", status: "present" }], "manual", null);
    await closeSession(env.DB as never, id);
    const r = await getReport(env.DB as never, "attendance-summary", {});
    expect(r?.rows.length).toBe(1);
    expect((r!.rows[0] as { rate: number }).rate).toBe(100); // 1 attended / 1 eligible
  });

  it("inactive-members report excludes recently active members", async () => {
    await addMember(env, "1");
    await addMember(env, "2");
    // member 1 attended recently
    await env.DB.prepare("INSERT INTO member_attendance_monthly (member_id, year_month, present, last_attended_date) VALUES ('1','2026-06',1,'2026-06-01')").run();
    const r = await getReport(env.DB as never, "inactive-members", {}, new Date("2026-06-04T00:00:00Z"));
    const ids = (r!.rows as { member_code: string | null }[]).length;
    expect(ids).toBe(1); // only member 2 is inactive
  });

  it("returns null for an unknown report type", async () => {
    expect(await getReport(env.DB as never, "nope" as never, {})).toBeNull();
  });
});
