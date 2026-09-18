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
  token = await signAccessToken({ sub: "u", role: "super_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
  // Seed the acting user so membership_history.changed_by FK is satisfied on writes.
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u','Admin','a@x.test','x','role_super_admin')").run();
  const ins = (id: string, first: string, last: string, phone: string, extra: Record<string, string> = {}) => {
    const cols = ["id", "first_name", "last_name", "phone_number", "registration_status", ...Object.keys(extra)];
    const vals = [id, first, last, phone, "approved", ...Object.values(extra)];
    return env.DB.prepare(`INSERT INTO members (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...vals).run();
  };
  await ins("m1", "Kwame", "Elder", "+233200000001", { officer_status: "elder", level: "400" });
  await ins("m2", "Akua", "Deaconess", "+233200000002", { officer_status: "deaconess" });
  await ins("m3", "Yaw", "Ordinary", "+233200000003", { level: "400" });
  await ins("m4", "Esi", "Graduate", "+233200000004", { membership_status: "alumni", level: "400" });
});

const req = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`https://x${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }), env as never);

describe("Officers & Alumni", () => {
  it("lists all officers with their office and cell", async () => {
    const r = await (await req("/api/officers")).json() as { results: { id: string; officer_status: string }[] };
    expect(r.results.map((x) => x.id).sort()).toEqual(["m1", "m2"]);
    expect(new Set(r.results.map((x) => x.officer_status))).toEqual(new Set(["elder", "deaconess"]));
  });

  it("excludes alumni from the default members directory", async () => {
    const r = await (await req("/api/members")).json() as { results: { id: string }[]; total: number };
    const ids = r.results.map((x) => x.id);
    expect(ids).not.toContain("m4");
    expect(ids).toContain("m3");
  });

  it("lists alumni when explicitly requested", async () => {
    const r = await (await req("/api/members?status=alumni")).json() as { results: { id: string }[] };
    expect(r.results.map((x) => x.id)).toEqual(["m4"]);
  });

  it("updates a member's officer status", async () => {
    const payload = {
      firstName: "Yaw", lastName: "Ordinary", phoneNumber: "+233200000003",
      officerStatus: "deacon", holyGhostBaptism: false, waterBaptism: false, membershipStatus: "actual_member",
    };
    const res = await req("/api/members/m3", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT officer_status FROM members WHERE id='m3'").first<{ officer_status: string }>();
    expect(row?.officer_status).toBe("deacon");
    const officers = await (await req("/api/officers")).json() as { results: { id: string }[] };
    expect(officers.results.map((x) => x.id).sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("moves a level-400 student to alumni via the status endpoint", async () => {
    const res = await req("/api/members/m3/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "alumni", reason: "completed" }) });
    expect(res.status).toBe(200);
    const dir = await (await req("/api/members")).json() as { results: { id: string }[] };
    expect(dir.results.map((x) => x.id)).not.toContain("m3");
    const alumni = await (await req("/api/members?status=alumni")).json() as { results: { id: string }[] };
    expect(alumni.results.map((x) => x.id).sort()).toEqual(["m3", "m4"]);
  });
});
