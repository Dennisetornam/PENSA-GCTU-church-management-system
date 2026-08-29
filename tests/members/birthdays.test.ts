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
  const ins = (id: string, first: string, last: string, phone: string, dob: string | null, status = "approved") =>
    env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number, date_of_birth, registration_status) VALUES (?,?,?,?,?,?)").bind(id, first, last, phone, dob, status).run();
  await ins("m1", "Ama", "Owusu", "+233200000001", "2001-06-14");
  await ins("m2", "Kofi", "Mensah", "+233200000002", "1999-06-03");
  await ins("m3", "Yaw", "Boateng", "+233200000003", "2000-07-20");
  await ins("m4", "Esi", "Pending", "+233200000004", "2002-06-09", "pending"); // not approved → excluded
  await ins("m5", "NoDob", "Person", "+233200000005", null);                    // no DOB → excluded
});

const get = (path: string) => app.fetch(new Request(`https://x${path}`, { headers: { authorization: `Bearer ${token}` } }), env as never);

describe("Members — birthdays", () => {
  it("requires members:read (401 unauthenticated)", async () => {
    expect((await app.fetch(new Request("https://x/api/members/birthdays?month=6"), env as never)).status).toBe(401);
  });

  it("lists approved members born in the month, ordered by day, excluding pending/no-DOB", async () => {
    const r = await (await get("/api/members/birthdays?month=6")).json() as { results: { id: string; date_of_birth: string }[] };
    expect(r.results.map((x) => x.id)).toEqual(["m2", "m1"]); // day 03 before day 14
    expect(r.results.every((x) => x.date_of_birth.slice(5, 7) === "06")).toBe(true);
  });

  it("does not collide with the /members/:id route", async () => {
    const res = await get("/api/members/birthdays?month=7");
    expect(res.status).toBe(200);
    const b = await res.json() as { results: { id: string }[] };
    expect(b.results.map((x) => x.id)).toEqual(["m3"]);
  });

  it("filters members by gender", async () => {
    await env.DB.prepare("UPDATE members SET gender='male' WHERE id IN ('m2','m3')").run();
    await env.DB.prepare("UPDATE members SET gender='female' WHERE id='m1'").run();
    const males = await (await get("/api/members?gender=male")).json() as { results: { id: string }[]; total: number };
    expect(males.results.map((x) => x.id).sort()).toEqual(["m2", "m3"]);
    const females = await (await get("/api/members?gender=female")).json() as { total: number };
    expect(females.total).toBe(1);
  });

  it("filters members by level", async () => {
    await env.DB.prepare("UPDATE members SET level='200' WHERE id IN ('m1','m3')").run();
    await env.DB.prepare("UPDATE members SET level='300' WHERE id='m2'").run();
    const l200 = await (await get("/api/members?level=200")).json() as { results: { id: string }[] };
    expect(l200.results.map((x) => x.id).sort()).toEqual(["m1", "m3"]);
  });

  it("exports filtered members as an Excel workbook", async () => {
    await env.DB.prepare("UPDATE members SET gender='male', level='200' WHERE id IN ('m2','m3')").run();
    const res = await get("/api/members/export?gender=male&level=200");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
