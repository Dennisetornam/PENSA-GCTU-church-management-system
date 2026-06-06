import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { adminRoutes } from "../../src/admin/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { submitRegistration } from "../../src/registration/repository";
import { memberDataSchema } from "../../src/registration/schemas";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const member = memberDataSchema.parse({
  firstName: "Yaw", lastName: "Owusu", otherNames: "",
  dateOfBirth: "2002-03-15", programmeId: "prog_focis_bsc_cs",
  residenceStatus: "hostel_resident", level: "200", residenceDetail: "Hall 7", vacationResidence: "Kumasi",
  departmentIds: ["dept_media"], cellId: "cell_moriah",
  holyGhostBaptism: true, holyGhostBaptismDate: "", waterBaptism: false, waterBaptismDate: "",
  phoneNumber: "0209998877", whatsappNumber: "", membershipStatus: "visitor",
  primaryGatheringTypeId: "gt_sunday", profileImageKey: "registrations/drafts/t/p.png",
});

let env: TestEnv;
let app: Hono;
let adminToken: string;

function makeApp() {
  const a = new Hono();
  a.route("/api", adminRoutes as never);
  return a;
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = makeApp();
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u-admin','Admin','a@x','h','role_church_admin')").run();
  adminToken = await signAccessToken({ sub: "u-admin", role: "church_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
});

describe("Module 4 — admin routes (JWT + RBAC)", () => {
  it("requires authentication (401 without a token)", async () => {
    const res = await app.fetch(new Request("https://x/api/registrations"), env as never);
    expect(res.status).toBe(401);
  });

  it("forbids a cell_leader from the approval queue (403)", async () => {
    const t = await signAccessToken({ sub: "u-cl", role: "cell_leader", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
    const res = await app.fetch(new Request("https://x/api/registrations", { headers: auth(t) }), env as never);
    expect(res.status).toBe(403);
  });

  it("lists pending then approves into a member with a PENSA code", async () => {
    const regId = await submitRegistration(env.DB as never, member, null, "2026");

    const list = await app.fetch(new Request("https://x/api/registrations?status=pending", { headers: auth(adminToken) }), env as never);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { results: { id: string }[] };
    expect(body.results.some((r) => r.id === regId.id)).toBe(true);

    const approve = await app.fetch(
      new Request(`https://x/api/registrations/${regId.id}/approve`, { method: "POST", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ membershipStatus: "visitor" }) }),
      env as never,
    );
    expect(approve.status).toBe(200);
    const ar = (await approve.json()) as { memberCode: string; memberId: string };
    expect(ar.memberCode).toBe("PENSA-2026-0001");

    // member now searchable
    const members = await app.fetch(new Request("https://x/api/members?q=Owusu", { headers: auth(adminToken) }), env as never);
    const mb = (await members.json()) as { results: { member_code: string }[] };
    expect(mb.results[0]?.member_code).toBe("PENSA-2026-0001");

    // reviewer recorded
    const reg = env.DB.__raw.prepare("SELECT reviewed_by FROM registrations WHERE id = ?").get(regId.id) as { reviewed_by: string };
    expect(reg.reviewed_by).toBe("u-admin");
  });

  it("rejects a registration with a reason", async () => {
    const regId = await submitRegistration(env.DB as never, { ...member, phoneNumber: "+233200000999" }, null, "2026");
    const res = await app.fetch(
      new Request(`https://x/api/registrations/${regId.id}/reject`, { method: "POST", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ reason: "duplicate" }) }),
      env as never,
    );
    expect(res.status).toBe(200);
    const reg = env.DB.__raw.prepare("SELECT status FROM registrations WHERE id = ?").get(regId.id) as { status: string };
    expect(reg.status).toBe("rejected");
  });

  it("changes a member's lifecycle status", async () => {
    const regId = await submitRegistration(env.DB as never, member, null, "2026");
    const ar = (await (await app.fetch(new Request(`https://x/api/registrations/${regId.id}/approve`, { method: "POST", headers: { ...auth(adminToken), "content-type": "application/json" }, body: "{}" }), env as never)).json()) as { memberId: string };
    const res = await app.fetch(
      new Request(`https://x/api/members/${ar.memberId}/status`, { method: "POST", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ status: "actual_member", reason: "confirmed" }) }),
      env as never,
    );
    expect(res.status).toBe(200);
    const m = env.DB.__raw.prepare("SELECT membership_status FROM members WHERE id = ?").get(ar.memberId) as { membership_status: string };
    expect(m.membership_status).toBe("actual_member");
  });
});
