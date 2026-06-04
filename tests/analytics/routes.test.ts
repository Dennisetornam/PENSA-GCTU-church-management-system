import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { analyticsRoutes } from "../../src/analytics/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let token: string;
const auth = () => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api/analytics", analyticsRoutes as never);
  token = await signAccessToken({ sub: "u-admin", role: "church_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
  await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number, membership_status, cell_id, registration_status) VALUES ('m1','A','B','+233200000001','visitor','cell_dunamis','approved')").run();
});

describe("Module 7 — analytics routes", () => {
  it("requires auth (401 without a token)", async () => {
    const res = await app.fetch(new Request("https://x/api/analytics/summary"), env as never);
    expect(res.status).toBe(401);
  });

  it("returns the KPI summary", async () => {
    const res = await app.fetch(new Request("https://x/api/analytics/summary", { headers: auth() }), env as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; visitors: number };
    expect(body.total).toBe(1);
    expect(body.visitors).toBe(1);
  });

  it("returns cell distribution", async () => {
    const res = await app.fetch(new Request("https://x/api/analytics/distribution?dimension=cell", { headers: auth() }), env as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { name: string; count: number }[] };
    expect(body.results.find((r) => r.name === "Dunamis")?.count).toBe(1);
  });

  it("rejects an invalid distribution dimension with 400", async () => {
    const res = await app.fetch(new Request("https://x/api/analytics/distribution?dimension=bogus", { headers: auth() }), env as never);
    expect(res.status).toBe(400);
  });

  it("returns baptism stats and growth", async () => {
    const b = await app.fetch(new Request("https://x/api/analytics/baptism", { headers: auth() }), env as never);
    expect(b.status).toBe(200);
    const g = await app.fetch(new Request("https://x/api/analytics/growth", { headers: auth() }), env as never);
    expect(g.status).toBe(200);
  });
});
