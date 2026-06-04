import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { attendanceRoutes } from "../../src/attendance/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { signMemberQr } from "../../src/attendance/qr";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let token: string;
const auth = () => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api/attendance", attendanceRoutes as never);
  token = await signAccessToken({ sub: "u-admin", role: "church_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u-admin','Admin','a@x','h','role_church_admin')").run();
  for (let i = 1; i <= 3; i++) {
    await env.DB.prepare(
      "INSERT INTO members (id, first_name, last_name, phone_number, cell_id, registration_status, qr_version) VALUES (?,?,?,?, 'cell_dunamis','approved',1)",
    ).bind(`m${i}`, `F${i}`, `L${i}`, `+23320000000${i}`).run();
  }
});

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://x${path}`, {
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

describe("Module 6 — attendance routes", () => {
  it("requires auth (401 without a token)", async () => {
    const res = await app.fetch(req("/api/attendance/sessions"), env as never);
    expect(res.status).toBe(401);
  });

  it("creates a session, marks a roster, and closes with a summary", async () => {
    const create = await app.fetch(req("/api/attendance/sessions", { method: "POST", headers: auth(), body: JSON.stringify({ gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" }) }), env as never);
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };

    const roster = await app.fetch(req(`/api/attendance/sessions/${id}/roster`, { headers: auth() }), env as never);
    const r = (await roster.json()) as { results: unknown[] };
    expect(r.results.length).toBe(3);

    const mark = await app.fetch(req(`/api/attendance/sessions/${id}/records`, { method: "PUT", headers: auth(), body: JSON.stringify({ marks: [{ memberId: "m1", status: "present" }, { memberId: "m2", status: "late" }] }) }), env as never);
    expect(mark.status).toBe(200);

    const close = await app.fetch(req(`/api/attendance/sessions/${id}/close`, { method: "POST", headers: auth() }), env as never);
    expect(close.status).toBe(200);

    const get = await app.fetch(req(`/api/attendance/sessions/${id}`, { headers: auth() }), env as never);
    const body = (await get.json()) as { summary: { present: number; attended: number } };
    expect(body.summary.present).toBe(1);
    expect(body.summary.attended).toBe(2);
  });

  it("checks in a member via QR", async () => {
    const create = await app.fetch(req("/api/attendance/sessions", { method: "POST", headers: auth(), body: JSON.stringify({ gatheringTypeId: "gt_sunday", sessionDate: "2026-06-07" }) }), env as never);
    const { id } = (await create.json()) as { id: string };
    const qr = await signMemberQr("m3", 1, env.JWT_SECRET);
    const res = await app.fetch(req("/api/attendance/check-in", { method: "POST", headers: auth(), body: JSON.stringify({ token: qr, sessionId: id }) }), env as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memberId: string };
    expect(body.memberId).toBe("m3");
  });

  it("returns 400 for an invalid session payload", async () => {
    const res = await app.fetch(req("/api/attendance/sessions", { method: "POST", headers: auth(), body: JSON.stringify({ gatheringTypeId: "gt_sunday", sessionDate: "not-a-date" }) }), env as never);
    expect(res.status).toBe(400);
  });
});
