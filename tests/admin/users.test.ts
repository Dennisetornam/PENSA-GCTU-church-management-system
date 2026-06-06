import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { userRoutes } from "../../src/admin/users";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let superToken: string;
let adminToken: string;
const auth = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = new Hono();
  app.route("/api/users", userRoutes as never);
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u-sa','Super','sa@x','h','role_super_admin')").run();
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u-ca','Admin','ca@x','h','role_church_admin')").run();
  superToken = await signAccessToken({ sub: "u-sa", role: "super_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
  adminToken = await signAccessToken({ sub: "u-ca", role: "church_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
});

const post = (path: string, token: string, body: unknown) =>
  app.fetch(new Request(`https://x/api/users${path}`, { method: "POST", headers: auth(token), body: JSON.stringify(body) }), env as never);

describe("Module 5b — user management", () => {
  it("401 without a token", async () => {
    expect((await app.fetch(new Request("https://x/api/users"), env as never)).status).toBe(401);
  });

  it("super admin creates a church admin and lists users", async () => {
    const res = await post("", superToken, { fullName: "Pastor Mensah", email: "mensah@pensa.gctu", password: "strongpassword123", role: "church_admin" });
    expect(res.status).toBe(201);
    const list = await app.fetch(new Request("https://x/api/users", { headers: auth(superToken) }), env as never);
    const body = (await list.json()) as { results: { email: string }[] };
    expect(body.results.some((u) => u.email === "mensah@pensa.gctu")).toBe(true);
  });

  it("blocks a church admin from creating a super admin (403)", async () => {
    const res = await post("", adminToken, { fullName: "Test User", email: "x@x.io", password: "strongpassword123", role: "super_admin" });
    expect(res.status).toBe(403);
  });

  it("suspends and reactivates a user (and cannot suspend self)", async () => {
    const created = (await (await post("", superToken, { fullName: "Leader One", email: "l1@x.io", password: "strongpassword123", role: "cell_leader" })).json()) as { id: string };
    expect((await post(`/${created.id}/suspend`, superToken, {})).status).toBe(200);
    expect(((env.DB.__raw.prepare("SELECT status FROM users WHERE id=?").get(created.id)) as { status: string }).status).toBe("suspended");
    expect((await post(`/${created.id}/activate`, superToken, {})).status).toBe(200);
    // cannot suspend self
    expect((await post("/u-sa/suspend", superToken, {})).status).toBe(400);
  });

  it("resets a user's password", async () => {
    const created = (await (await post("", superToken, { fullName: "Leader Two", email: "l2@x.io", password: "strongpassword123", role: "cell_leader" })).json()) as { id: string };
    expect((await post(`/${created.id}/reset-password`, superToken, { newPassword: "brandnewpass123" })).status).toBe(200);
  });
});
