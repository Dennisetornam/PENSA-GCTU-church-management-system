import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { adminRoutes } from "../../src/admin/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let token: string;

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api", adminRoutes as never);
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u-sa','SA','sa@x','h','role_super_admin')").run();
  token = await signAccessToken({ sub: "u-sa", role: "super_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
  await env.DB.prepare(
    "INSERT INTO members (id, first_name, last_name, phone_number, membership_status, registration_status, cell_id) VALUES ('m1','Old','Name','+233200000001','visitor','approved','cell_dunamis')",
  ).run();
});

const update = (id: string, body: unknown) =>
  app.fetch(new Request(`https://x/api/members/${id}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }), env as never);

const base = {
  firstName: "New", lastName: "Name", dateOfBirth: "2003-01-01", level: "300",
  residenceStatus: "non_resident" as const, residenceDetail: "Madina", cellId: "cell_moriah",
  holyGhostBaptism: true, waterBaptism: true, phoneNumber: "0241234567",
  membershipStatus: "actual_member" as const, departmentIds: ["dept_media", "dept_prayer"],
};

describe("Module 5c — member edit", () => {
  it("requires auth (401)", async () => {
    const res = await app.fetch(new Request("https://x/api/members/m1", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env as never);
    expect(res.status).toBe(401);
  });

  it("edits a member's details, status (history) and departments", async () => {
    const res = await update("m1", base);
    expect(res.status).toBe(200);
    const m = env.DB.__raw.prepare("SELECT first_name, level, cell_id, phone_number, membership_status, holy_ghost_baptism FROM members WHERE id='m1'").get() as Record<string, unknown>;
    expect(m.first_name).toBe("New");
    expect(m.level).toBe("300");
    expect(m.cell_id).toBe("cell_moriah");
    expect(m.phone_number).toBe("+233241234567"); // normalized
    expect(m.membership_status).toBe("actual_member");
    expect(m.holy_ghost_baptism).toBe(1);

    const depts = env.DB.__raw.prepare("SELECT count(*) c FROM member_departments WHERE member_id='m1'").get() as { c: number };
    expect(depts.c).toBe(2);

    const hist = env.DB.__raw.prepare("SELECT to_status FROM membership_history WHERE member_id='m1' ORDER BY created_at DESC LIMIT 1").get() as { to_status: string };
    expect(hist.to_status).toBe("actual_member");
  });

  it("404 for an unknown member", async () => {
    expect((await update("nope", base)).status).toBe(404);
  });
});
