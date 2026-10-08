import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { headRoutes } from "../../src/head-portal/routes";
import { deptReportRoutes } from "../../src/semester-reports/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let head: string;   // department_head scoped to dept_media
let sa: string;

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api/head", headRoutes as never);
  app.route("/api/dept-reports", deptReportRoutes as never);
  // the head is a member, set as Media's leader (this is what grants scope)
  await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number, registration_status) VALUES ('mem-head','Media','Head','+233200000000','approved')").run();
  await env.DB.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, role_id, member_id) VALUES
      ('u-sa','Admin','a@x','h','role_super_admin',NULL),
      ('u-head','Media Head','mh@x','h','role_dept_head','mem-head')`,
  ).run();
  await env.DB.prepare("UPDATE departments SET leader_member_id='mem-head' WHERE id='dept_media'").run();
  // a member who serves in Media
  await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number, registration_status) VALUES ('m1','Ama','Owusu','+233200000001','approved')").run();
  await env.DB.prepare("INSERT INTO member_departments (id, member_id, department_id, role_in_department, joined_at) VALUES ('md1','m1','dept_media','member',datetime('now'))").run();
  // a member in another department (should NOT appear for this head)
  await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number, registration_status) VALUES ('m2','Kofi','Mensah','+233200000002','approved')").run();
  await env.DB.prepare("INSERT INTO member_departments (id, member_id, department_id, role_in_department, joined_at) VALUES ('md2','m2','dept_prayer','member',datetime('now'))").run();

  head = await signAccessToken({ sub: "u-head", role: "department_head", scope: { departments: ["dept_media"], cells: [] } }, env.JWT_SECRET);
  sa = await signAccessToken({ sub: "u-sa", role: "super_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
});

const get = (path: string, t: string) => app.fetch(new Request(`https://x${path}`, { headers: { authorization: `Bearer ${t}` } }), env as never);
const post = (path: string, t: string, body: unknown) => app.fetch(new Request(`https://x${path}`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify(body) }), env as never);

describe("Department Head portal", () => {
  it("overview returns only the head's departments", async () => {
    const o = await (await get("/api/head/overview", head)).json() as { departments: { id: string; member_count: number }[] };
    expect(o.departments.map((d) => d.id)).toEqual(["dept_media"]);
    expect(o.departments[0]!.member_count).toBe(1); // only m1 serves in Media
  });

  it("members endpoint is scoped — only the head's department members, with attendance summary", async () => {
    const r = await (await get("/api/head/members", head)).json() as { results: { id: string; attended_count: number }[] };
    expect(r.results.map((x) => x.id)).toEqual(["m1"]);
    expect(r.results[0]).toHaveProperty("attended_count");
  });

  it("a head can submit only for their own department", async () => {
    const period = await (await post("/api/dept-reports/periods", sa, { name: "Sem 1" })).json() as { id: string };
    expect((await post("/api/dept-reports/submit", head, { periodId: period.id, departmentId: "dept_media", summary: "ok" })).status).toBe(201);
    expect((await post("/api/dept-reports/submit", head, { periodId: period.id, departmentId: "dept_prayer", summary: "no" })).status).toBe(403);
  });

  it("a head cannot manage periods (reports:manage) or take attendance", async () => {
    expect((await post("/api/dept-reports/periods", head, { name: "X" })).status).toBe(403);
  });
});
