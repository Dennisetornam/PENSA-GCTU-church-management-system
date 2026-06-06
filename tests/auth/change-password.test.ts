import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authRoutes } from "../../src/auth/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { hashPassword, verifyPassword } from "../../src/auth/password";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const ORIGIN = "https://admin.pensa.gctu";
let env: TestEnv;
let app: Hono;
let token: string;

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/auth", authRoutes as never);
  const hash = await hashPassword("oldpassword123", 10_000);
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u1','U','u@x',?,'role_super_admin')").bind(hash).run();
  token = await signAccessToken({ sub: "u1", role: "super_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
});

const change = (body: unknown) =>
  app.fetch(new Request(`${ORIGIN}/auth/change-password`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) }), env as never);

describe("Module 5b — change password", () => {
  it("changes the password with the correct current one", async () => {
    const res = await change({ currentPassword: "oldpassword123", newPassword: "a-brand-new-password" });
    expect(res.status).toBe(200);
    const hash = (env.DB.__raw.prepare("SELECT password_hash h FROM users WHERE id='u1'").get() as { h: string }).h;
    expect(await verifyPassword("a-brand-new-password", hash)).toBe(true);
  });
  it("rejects a wrong current password", async () => {
    expect((await change({ currentPassword: "WRONG", newPassword: "a-brand-new-password" })).status).toBe(400);
  });
  it("rejects a too-short new password", async () => {
    expect((await change({ currentPassword: "oldpassword123", newPassword: "short" })).status).toBe(400);
  });
  it("401 without a token", async () => {
    const res = await app.fetch(new Request(`${ORIGIN}/auth/change-password`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}" }), env as never);
    expect(res.status).toBe(401);
  });
});
