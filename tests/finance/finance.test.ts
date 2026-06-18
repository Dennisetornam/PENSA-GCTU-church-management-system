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

  it("edits an entry's figures", async () => {
    const created = await (await rec({ category: "offering_cash", amount: 100, paymentMethod: "cash", serviceTypeId: "gt_sunday", occurredOn: "2026-06-07" })).json() as { id: string };
    const put = await app.fetch(new Request(`https://x/api/finance/${created.id}`, { method: "PUT", headers: auth(token), body: JSON.stringify({ category: "offering_cash", amount: 250.75, paymentMethod: "momo", serviceTypeId: "gt_sunday", occurredOn: "2026-06-08" }) }), env as never);
    expect(put.status).toBe(200);
    const row = env.DB.__raw.prepare("SELECT amount_minor, payment_method, occurred_on FROM finance_entries WHERE id = ?").get(created.id) as { amount_minor: number; payment_method: string; occurred_on: string };
    expect(row.amount_minor).toBe(25075);
    expect(row.payment_method).toBe("momo");
    expect(row.occurred_on).toBe("2026-06-08");
  });

  it("returns 404 when editing a missing entry", async () => {
    const put = await app.fetch(new Request("https://x/api/finance/does-not-exist", { method: "PUT", headers: auth(token), body: JSON.stringify({ category: "tithe", amount: 10, memberName: "X", occurredOn: "2026-06-07" }) }), env as never);
    expect(put.status).toBe(404);
  });

  it("edit is finance:manage-guarded", async () => {
    const t = await signAccessToken({ sub: "x", role: "cell_leader", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
    const put = await app.fetch(new Request("https://x/api/finance/whatever", { method: "PUT", headers: auth(t), body: JSON.stringify({ category: "tithe", amount: 10, memberName: "X", occurredOn: "2026-06-07" }) }), env as never);
    expect(put.status).toBe(403);
  });

  it("image upload endpoint is finance:manage-guarded", async () => {
    const t = await signAccessToken({ sub: "x", role: "cell_leader", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
    const r = await app.fetch(new Request("https://x/api/finance/image", { method: "POST", headers: auth(t), body: "{}" }), env as never);
    expect(r.status).toBe(403);
  });

  it("computes the monthly sector quota at 15% of offerings + tithes", async () => {
    await rec({ category: "offering_cash", amount: 100, occurredOn: "2026-06-07" });
    await rec({ category: "offering_momo", amount: 50, paymentMethod: "momo", occurredOn: "2026-06-07" });
    await rec({ category: "tithe", amount: 200, memberName: "Ama Owusu", occurredOn: "2026-06-07" });
    await rec({ category: "pledge", amount: 1000, memberName: "Kofi", pledgeStatus: "fully_redeemed", occurredOn: "2026-06-07" }); // excluded
    await rec({ category: "fundraising", amount: 500, occurredOn: "2026-06-07" });                                                  // excluded
    await rec({ category: "offering_cash", amount: 80, occurredOn: "2026-05-04" });                                                 // prior month

    const q = await (await app.fetch(new Request("https://x/api/finance/quota", { headers: auth(token) }), env as never)).json() as { rate: number; results: { year_month: string; base_minor: number; quota_minor: number }[] };
    expect(q.rate).toBe(0.15);
    const jun = q.results.find((r) => r.year_month === "2026-06")!;
    expect(jun.base_minor).toBe(35000);   // (100 + 50 + 200) GHS, pledge/fundraising excluded
    expect(jun.quota_minor).toBe(5250);   // 15%
    const may = q.results.find((r) => r.year_month === "2026-05")!;
    expect(may.base_minor).toBe(8000);
    expect(may.quota_minor).toBe(1200);
  });

  const expense = (body: unknown, t = token) => app.fetch(new Request("https://x/api/finance/expenses", { method: "POST", headers: auth(t), body: JSON.stringify(body) }), env as never);

  it("records an expense and subtracts it to give the net actual figure", async () => {
    await rec({ category: "offering_cash", amount: 1000, occurredOn: "2026-06-07" });
    await rec({ category: "tithe", amount: 500, memberName: "Ama", occurredOn: "2026-06-07" });
    expect((await expense({ category: "Refreshments", amount: 120.5, paymentMethod: "cash", occurredOn: "2026-06-07" })).status).toBe(201);
    await expense({ category: "Transport", amount: 80, paymentMethod: "momo", occurredOn: "2026-06-07" });

    const row = env.DB.__raw.prepare("SELECT amount_minor, recorded_by FROM finance_expenses WHERE category='Refreshments'").get() as { amount_minor: number; recorded_by: string };
    expect(row.amount_minor).toBe(12050);
    expect(row.recorded_by).toBe("u-sa");

    const sum = await (await app.fetch(new Request("https://x/api/finance/summary", { headers: auth(token) }), env as never)).json() as { totalMinor: number; expensesMinor: number; netMinor: number };
    expect(sum.totalMinor).toBe(150000);     // 1500 GHS received
    expect(sum.expensesMinor).toBe(20050);   // 120.50 + 80
    expect(sum.netMinor).toBe(150000 - 20050);
  });

  it("lists and edits an expense", async () => {
    const created = await (await expense({ category: "Logistics", amount: 60, paymentMethod: "cash", occurredOn: "2026-06-07" })).json() as { id: string };
    const list = await (await app.fetch(new Request("https://x/api/finance/expenses", { headers: auth(token) }), env as never)).json() as { results: { id: string; category: string; recorded_by_name: string }[] };
    expect(list.results[0]?.category).toBe("Logistics");
    expect(list.results[0]?.recorded_by_name).toBe("Treasurer");

    const put = await app.fetch(new Request(`https://x/api/finance/expenses/${created.id}`, { method: "PUT", headers: auth(token), body: JSON.stringify({ category: "Logistics", amount: 95.25, paymentMethod: "bank", occurredOn: "2026-06-08" }) }), env as never);
    expect(put.status).toBe(200);
    const row = env.DB.__raw.prepare("SELECT amount_minor, payment_method FROM finance_expenses WHERE id = ?").get(created.id) as { amount_minor: number; payment_method: string };
    expect(row.amount_minor).toBe(9525);
    expect(row.payment_method).toBe("bank");
  });

  it("expense endpoints are finance:manage-guarded", async () => {
    const t = await signAccessToken({ sub: "x", role: "cell_leader", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
    expect((await expense({ category: "X", amount: 5, occurredOn: "2026-06-07" }, t)).status).toBe(403);
  });

  it("quota base is net: that month's expenses are subtracted before the 15%", async () => {
    await rec({ category: "offering_cash", amount: 400, occurredOn: "2026-06-07" });
    await rec({ category: "tithe", amount: 200, memberName: "Ama", occurredOn: "2026-06-07" });
    await expense({ category: "Logistics", amount: 150, occurredOn: "2026-06-10" }); // same month, reduces base
    await expense({ category: "Misc", amount: 50, occurredOn: "2026-05-01" });        // other month, no effect on June

    const q = await (await app.fetch(new Request("https://x/api/finance/quota", { headers: auth(token) }), env as never)).json() as {
      results: { year_month: string; gross_minor: number; expenses_minor: number; base_minor: number; quota_minor: number }[];
    };
    const jun = q.results.find((r) => r.year_month === "2026-06")!;
    expect(jun.gross_minor).toBe(60000);     // 600 offerings + tithes
    expect(jun.expenses_minor).toBe(15000);  // 150 expenses
    expect(jun.base_minor).toBe(45000);      // net 450
    expect(jun.quota_minor).toBe(6750);      // 15% of 450
  });
});
