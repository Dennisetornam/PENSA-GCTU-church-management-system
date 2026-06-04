import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import * as XLSX from "xlsx";
import { reportRoutes } from "../../src/reports/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let token: string;
const auth = () => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api/reports", reportRoutes as never);
  token = await signAccessToken({ sub: "u-admin", role: "church_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
  await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number, member_code, membership_status, cell_id, registration_status) VALUES ('m1','Ama','Boateng','+233200000001','PENSA-2026-0001','visitor','cell_dunamis','approved')").run();
});

const get = (path: string, headers: Record<string, string> = {}) => app.fetch(new Request(`https://x${path}`, { headers }), env as never);

describe("Module 8 — report routes", () => {
  it("requires auth (401)", async () => {
    expect((await get("/api/reports/members")).status).toBe(401);
  });

  it("returns JSON by default", async () => {
    const res = await get("/api/reports/members", auth());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[] };
    expect(body.rows.length).toBe(1);
  });

  it("exports CSV with the right headers and content", async () => {
    const res = await get("/api/reports/members?format=csv", auth());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("members.csv");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("Member ID,Name,Phone,Cell,Status");
    expect(text).toContain("PENSA-2026-0001");
  });

  it("exports a valid Excel workbook", async () => {
    const res = await get("/api/reports/members?format=xlsx", auth());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
    const wb = XLSX.read(buf, { type: "array" });
    expect(wb.SheetNames.length).toBeGreaterThan(0);
  });

  it("404 for an unknown report type", async () => {
    expect((await get("/api/reports/bogus", auth())).status).toBe(404);
  });
});
