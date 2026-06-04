import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authRoutes } from "../../src/auth/routes";
import { hashPassword } from "../../src/auth/password";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const ORIGIN = "https://admin.pensa.gctu";

function makeApp() {
  const app = new Hono();
  app.route("/auth", authRoutes as never);
  return app;
}

async function seedAdmin(env: TestEnv, password: string) {
  const hash = await hashPassword(password, 10_000);
  await env.DB.prepare(
    "INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES (?,?,?,?,?)",
  )
    .bind("u-admin", "Super Admin", "admin@pensa.gctu", hash, "role_super_admin")
    .run();
}

function cookieValue(res: Response, name: string): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  const all = h.getSetCookie?.() ?? [];
  for (const c of all) if (c.startsWith(name + "=")) return c.slice(name.length + 1).split(";")[0]!;
  return null;
}

function call(app: Hono, env: TestEnv, path: string, init: RequestInit = {}) {
  const req = new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) },
    ...init,
  });
  return app.fetch(req, env as never);
}

let env: TestEnv;
let app: Hono;
beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  app = makeApp();
  await seedAdmin(env, "Sup3rSecret!pw");
});

describe("Module 2 — auth routes", () => {
  it("logs in with valid credentials and sets __Host-at", async () => {
    const res = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    expect(res.status).toBe(200);
    expect(cookieValue(res, "__Host-at")).toBeTruthy();
    expect(cookieValue(res, "__Host-rt")).toBeTruthy();
  });

  it("rejects wrong password with uniform 401", async () => {
    const res = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "wrong" }) });
    expect(res.status).toBe(401);
  });

  it("locks the account after 5 failures", async () => {
    for (let i = 0; i < 5; i++) {
      await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "wrong" }) });
    }
    // correct password now blocked by lock
    const res = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    expect(res.status).toBe(401);
  });

  it("/auth/me returns the user from the access cookie", async () => {
    const login = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const at = cookieValue(login, "__Host-at");
    const me = await app.fetch(new Request(`${ORIGIN}/auth/me`, { headers: { cookie: `__Host-at=${at}` } }), env as never);
    expect(me.status).toBe(200);
    const body = (await me.json()) as { role: string };
    expect(body.role).toBe("super_admin");
  });

  it("refresh rotates and detects reuse of the old token", async () => {
    const login = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const rt = cookieValue(login, "__Host-rt")!;
    const r1 = await call(app, env, "/auth/refresh", { headers: { cookie: `__Host-rt=${rt}` } });
    expect(r1.status).toBe(200);
    expect(cookieValue(r1, "__Host-at")).toBeTruthy();
    // reuse the original (now-rotated) token → reuse detection → 401
    const reuse = await call(app, env, "/auth/refresh", { headers: { cookie: `__Host-rt=${rt}` } });
    expect(reuse.status).toBe(401);
  });

  it("logout revokes the family so the refresh token no longer works", async () => {
    const login = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const rt = cookieValue(login, "__Host-rt")!;
    await call(app, env, "/auth/logout", { headers: { cookie: `__Host-rt=${rt}` } });
    const after = await call(app, env, "/auth/refresh", { headers: { cookie: `__Host-rt=${rt}` } });
    expect(after.status).toBe(401);
  });

  it("blocks refresh from a foreign origin (CSRF)", async () => {
    const login = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const rt = cookieValue(login, "__Host-rt")!;
    const res = await app.fetch(
      new Request(`${ORIGIN}/auth/refresh`, { method: "POST", headers: { cookie: `__Host-rt=${rt}`, origin: "https://evil.example" } }),
      env as never,
    );
    expect(res.status).toBe(403);
  });
});
