import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { financeRoutes } from "../../src/finance/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let token: string;
const auth = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api/finance", financeRoutes as never);
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u-sa','Treasurer','t@x','h','role_church_admin')").run();
  token = await signAccessToken({ sub: "u-sa", role: "church_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
});

const rec = (body: unknown, t = token) => app.fetch(new Request("https://x/api/finance", { method: "POST", headers: auth(t), body: JSON.stringify(body) }), env as never);

describe("Module 7b — finance", () => {
  it("requires auth (401)", async () => {
    expect((await app.fetch(new Request("https://x/api/finance"), env as never)).status).toBe(401);
  });

  it("forbids a cell_leader (403)", async () => {
    const t = await signAccessToken({ sub: "x", role: "cell_leader", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
    expect((await app.fetch(new Request("https://x/api/finance", { headers: auth(t) }), env as never)).status).toBe(403);
  });

  it("records giving and totals by category", async () => {
    expect((await rec({ category: "offering_cash", amount: 150.5, paymentMethod: "cash", serviceTypeId: "gt_sunday", occurredOn: "2026-06-07" })).status).toBe(201);
    await rec({ category: "offering_momo", amount: 80, paymentMethod: "momo", serviceTypeId: "gt_sunday", occurredOn: "2026-06-07" });
    await rec({ category: "tithe", amount: 200, paymentMethod: "bank", serviceTypeId: "gt_sunday", occurredOn: "2026-06-07" });

    // stored as minor units
    const row = env.DB.__raw.prepare("SELECT amount_minor, currency, recorded_by FROM finance_entries WHERE category='offering_cash'").get() as { amount_minor: number; currency: string; recorded_by: string };
    expect(row.amount_minor).toBe(15050);
    expect(row.currency).toBe("GHS");
    expect(row.recorded_by).toBe("u-sa");

    const sum = await (await app.fetch(new Request("https://x/api/finance/summary", { headers: auth(token) }), env as never)).json() as { byCategory: Record<string, { total_minor: number }>; totalMinor: number };
    expect(sum.byCategory.offering_cash.total_minor).toBe(15050);
    expect(sum.byCategory.tithe.total_minor).toBe(20000);
    expect(sum.totalMinor).toBe(15050 + 8000 + 20000);
  });

  it("lists entries with recorder + service name", async () => {
    await rec({ category: "pledge", amount: 500, paymentMethod: "cash", serviceTypeId: "gt_adullam", occurredOn: "2026-06-06" });
    const list = await (await app.fetch(new Request("https://x/api/finance", { headers: auth(token) }), env as never)).json() as { results: { category: string; service_name: string; recorded_by_name: string }[] };
    expect(list.results[0].category).toBe("pledge");
    expect(list.results[0].service_name).toBe("Adullam");
    expect(list.results[0].recorded_by_name).toBe("Treasurer");
  });

  it("rejects invalid amount", async () => {
    expect((await rec({ category: "tithe", amount: -5, occurredOn: "2026-06-07" })).status).toBe(400);
  });
});
