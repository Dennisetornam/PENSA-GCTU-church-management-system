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
    await rec({ category: "tithe", amount: 200, paymentMethod: "bank", serviceTypeId: "gt_sunday", memberName: "Ama Owusu", occurredOn: "2026-06-07" });

    // stored as minor units
    const row = env.DB.__raw.prepare("SELECT amount_minor, currency, recorded_by FROM finance_entries WHERE category='offering_cash'").get() as { amount_minor: number; currency: string; recorded_by: string };
    expect(row.amount_minor).toBe(15050);
    expect(row.currency).toBe("GHS");
    expect(row.recorded_by).toBe("u-sa");

    const sum = await (await app.fetch(new Request("https://x/api/finance/summary", { headers: auth(token) }), env as never)).json() as { byCategory: Record<string, { total_minor: number }>; totalMinor: number };
    expect(sum.byCategory.offering_cash?.total_minor).toBe(15050);
    expect(sum.byCategory.tithe?.total_minor).toBe(20000);
    expect(sum.totalMinor).toBe(15050 + 8000 + 20000);
  });

  it("lists entries with recorder + service name", async () => {
    await rec({ category: "pledge", amount: 500, paymentMethod: "cash", serviceTypeId: "gt_adullam", memberName: "Yaw Boateng", pledgeStatus: "fully_redeemed", occurredOn: "2026-06-06" });
    const list = await (await app.fetch(new Request("https://x/api/finance", { headers: auth(token) }), env as never)).json() as { results: { category: string; service_name: string; recorded_by_name: string; member_name: string; pledge_status: string }[] };
    expect(list.results[0]?.category).toBe("pledge");
    expect(list.results[0]?.service_name).toBe("Adullam");
    expect(list.results[0]?.recorded_by_name).toBe("Treasurer");
    expect(list.results[0]?.member_name).toBe("Yaw Boateng");
    expect(list.results[0]?.pledge_status).toBe("fully_redeemed");
  });

  it("rejects invalid amount", async () => {
    expect((await rec({ category: "tithe", amount: -5, memberName: "Ama", occurredOn: "2026-06-07" })).status).toBe(400);
  });

  it("requires a member name for tithes and pledges", async () => {
    expect((await rec({ category: "tithe", amount: 50, occurredOn: "2026-06-07" })).status).toBe(400);
    expect((await rec({ category: "pledge", amount: 50, occurredOn: "2026-06-07" })).status).toBe(400);
  });

  it("requires pledge redemption status, and stores member + status", async () => {
    // pledge without status -> 400
    expect((await rec({ category: "pledge", amount: 100, memberName: "Kofi", occurredOn: "2026-06-07" })).status).toBe(400);
    // valid pledge
    expect((await rec({ category: "pledge", amount: 100, memberName: "Kofi Mensah", pledgeStatus: "partly_redeemed", occurredOn: "2026-06-07" })).status).toBe(201);
    expect((await rec({ category: "tithe", amount: 40, memberName: "Ama Owusu", occurredOn: "2026-06-07" })).status).toBe(201);

    const pledge = env.DB.__raw.prepare("SELECT member_name, pledge_status FROM finance_entries WHERE category='pledge'").get() as { member_name: string; pledge_status: string };
    expect(pledge.member_name).toBe("Kofi Mensah");
    expect(pledge.pledge_status).toBe("partly_redeemed");

    const tithe = env.DB.__raw.prepare("SELECT member_name, pledge_status FROM finance_entries WHERE category='tithe'").get() as { member_name: string; pledge_status: string | null };
    expect(tithe.member_name).toBe("Ama Owusu");
    expect(tithe.pledge_status).toBeNull();
  });

  it("links giving to the attendance session it was collected during", async () => {
    await env.DB.prepare("INSERT INTO attendance_sessions (id, gathering_type_id, title, session_date, status, recorded_by, created_at, updated_at) VALUES ('sess-1','gt_sunday','Sun','2026-06-07','open','u-sa', datetime('now'), datetime('now'))").run();
    expect((await rec({ category: "offering_cash", amount: 75, serviceTypeId: "gt_sunday", sessionId: "sess-1", occurredOn: "2026-06-07" })).status).toBe(201);

    const row = env.DB.__raw.prepare("SELECT session_id FROM finance_entries WHERE category='offering_cash'").get() as { session_id: string };
    expect(row.session_id).toBe("sess-1");

    const list = await (await app.fetch(new Request("https://x/api/finance?sessionId=sess-1", { headers: auth(token) }), env as never)).json() as { results: unknown[] };
    expect(list.results.length).toBe(1);
  });

  it("does not attach member/pledge fields to plain offerings", async () => {
    await rec({ category: "offering_cash", amount: 30, memberName: "Should Ignore", pledgeStatus: "fully_redeemed", occurredOn: "2026-06-07" });
    const row = env.DB.__raw.prepare("SELECT member_name, pledge_status FROM finance_entries WHERE category='offering_cash'").get() as { member_name: string | null; pledge_status: string | null };
    expect(row.member_name).toBeNull();
    expect(row.pledge_status).toBeNull();
  });

  it("stores a Momo reference image key only for offering_momo", async () => {
    expect((await rec({ category: "offering_momo", amount: 60, paymentMethod: "momo", referenceImageKey: "finance/momo/abc.jpg", occurredOn: "2026-06-07" })).status).toBe(201);
    const momo = env.DB.__raw.prepare("SELECT reference_image_key FROM finance_entries WHERE category='offering_momo'").get() as { reference_image_key: string };
    expect(momo.reference_image_key).toBe("finance/momo/abc.jpg");

    // a reference on a non-momo category is ignored
    await rec({ category: "offering_cash", amount: 20, referenceImageKey: "finance/momo/x.jpg", occurredOn: "2026-06-07" });
    const cash = env.DB.__raw.prepare("SELECT reference_image_key FROM finance_entries WHERE category='offering_cash'").get() as { reference_image_key: string | null };
    expect(cash.reference_image_key).toBeNull();
  });

  it("image upload endpoint is finance:manage-guarded", async () => {
    const t = await signAccessToken({ sub: "x", role: "cell_leader", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
    const r = await app.fetch(new Request("https://x/api/finance/image", { method: "POST", headers: auth(t), body: "{}" }), env as never);
    expect(r.status).toBe(403);
  });
});
