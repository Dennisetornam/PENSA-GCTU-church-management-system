import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { adminRoutes } from "../../src/admin/routes";
import { deptReportRoutes } from "../../src/semester-reports/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let sa: string;      // super admin
let head: string;    // department leader for dept_media
let pres: string;    // president
let cell: string;    // cell leader (no reports:manage / audit)

const allScope = { departments: [] as string[], cells: [] as string[] };

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api/dept-reports", deptReportRoutes as never);
  app.route("/api", adminRoutes as never);
  await env.DB.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES
      ('u-sa','Admin','a@x','h','role_super_admin'),
      ('u-head','Media Head','h@x','h','role_dept_leader'),
      ('u-pres','President','p@x','h','role_president'),
      ('u-cell','Cell Leader','c@x','h','role_cell_leader')`,
  ).run();
  sa = await signAccessToken({ sub: "u-sa", role: "super_admin", scope: allScope }, env.JWT_SECRET);
  head = await signAccessToken({ sub: "u-head", role: "department_leader", scope: { departments: ["dept_media"], cells: [] } }, env.JWT_SECRET);
  pres = await signAccessToken({ sub: "u-pres", role: "president", scope: allScope }, env.JWT_SECRET);
  cell = await signAccessToken({ sub: "u-cell", role: "cell_leader", scope: { departments: [], cells: ["cell_dunamis"] } }, env.JWT_SECRET);
});

const H = (t: string, body?: unknown) => ({ method: body ? "POST" : "GET", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = (path: string, t: string, body?: unknown) => app.fetch(new Request(`https://x${path}`, H(t, body)), env as never);

describe("Departmental reports + oversight", () => {
  it("full flow: create period, head submits, board reflects it, scope + close enforced", async () => {
    const period = await (await call("/api/dept-reports/periods", sa, { name: "2025/2026 · Sem 1", dueDate: "2026-12-01" })).json() as { id: string };
    expect(period.id).toBeTruthy();

    const list = await (await call("/api/dept-reports/periods", sa)).json() as { results: { id: string; department_count: number }[] };
    expect(list.results.length).toBe(1);
    expect(list.results[0]!.department_count).toBeGreaterThan(0);

    // head submits for their own department
    expect((await call("/api/dept-reports/submit", head, { periodId: period.id, departmentId: "dept_media", fileKey: "reports/x.pdf", fileName: "media.pdf", summary: "A good semester" })).status).toBe(201);

    // head cannot submit for another department
    expect((await call("/api/dept-reports/submit", head, { periodId: period.id, departmentId: "dept_prayer", summary: "nope" })).status).toBe(403);

    // board shows media submitted, others pending
    const board = await (await call(`/api/dept-reports/periods/${period.id}/board`, sa)).json() as { results: { department_id: string; report_id: string | null; file_name: string | null }[] };
    const media = board.results.find((r) => r.department_id === "dept_media")!;
    expect(media.report_id).toBeTruthy();
    expect(media.file_name).toBe("media.pdf");
    expect(board.results.some((r) => r.department_id !== "dept_media" && r.report_id === null)).toBe(true);

    // head's own view
    const mine = await (await call("/api/dept-reports/mine", head)).json() as { period: { id: string }; departments: { department_id: string; report_id: string | null }[] };
    expect(mine.period.id).toBe(period.id);
    expect(mine.departments.find((d) => d.department_id === "dept_media")?.report_id).toBeTruthy();

    // close the period → further submissions rejected
    expect((await call(`/api/dept-reports/periods/${period.id}/close`, sa, {})).status).toBe(200);
    expect((await call("/api/dept-reports/submit", head, { periodId: period.id, departmentId: "dept_media", summary: "late" })).status).toBe(409);
  });

  it("president can view the board but department leaders cannot manage", async () => {
    const period = await (await call("/api/dept-reports/periods", sa, { name: "Period One" })).json() as { id: string };
    expect((await call(`/api/dept-reports/periods/${period.id}/board`, pres)).status).toBe(200);
    expect((await call(`/api/dept-reports/periods/${period.id}/board`, head)).status).toBe(403); // reports:manage required
    expect((await call("/api/dept-reports/periods", head, { name: "X" })).status).toBe(403);
  });

  it("activity log is visible to president/admin, not to a cell leader", async () => {
    expect((await call("/api/audit", sa)).status).toBe(200);
    expect((await call("/api/audit", pres)).status).toBe(200);
    expect((await call("/api/audit", cell)).status).toBe(403);
  });
});
