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

function setCookieString(res: Response, name: string): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  for (const c of h.getSetCookie?.() ?? []) if (c.startsWith(name + "=")) return c;
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
    expect(cookieValue(res, "__Secure-rt")).toBeTruthy();
  });

  // Regression: a path-scoped refresh cookie must NOT use the `__Host-` prefix —
  // browsers silently drop a `__Host-` cookie whose Path is not `/`, which broke
  // token refresh (sessions died after the 15-min access token expired).
  it("refresh cookie is path-scoped and uses a browser-storable prefix", async () => {
    const res = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const rtCookie = setCookieString(res, "__Secure-rt")!;
    expect(rtCookie).toContain("Path=/auth");
    expect(rtCookie).not.toMatch(/^__Host-/);      // __Host- + non-root Path is rejected by browsers
    // the access cookie, being root-scoped, may keep the stricter __Host- prefix
    const atCookie = setCookieString(res, "__Host-at")!;
    expect(atCookie).toContain("Path=/");
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
    const rt = cookieValue(login, "__Secure-rt")!;
    const r1 = await call(app, env, "/auth/refresh", { headers: { cookie: `__Secure-rt=${rt}` } });
    expect(r1.status).toBe(200);
    expect(cookieValue(r1, "__Host-at")).toBeTruthy();
    // reuse the original (now-rotated) token → reuse detection → 401
    const reuse = await call(app, env, "/auth/refresh", { headers: { cookie: `__Secure-rt=${rt}` } });
    expect(reuse.status).toBe(401);
  });

  it("logout revokes the family so the refresh token no longer works", async () => {
    const login = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const rt = cookieValue(login, "__Secure-rt")!;
    await call(app, env, "/auth/logout", { headers: { cookie: `__Secure-rt=${rt}` } });
    const after = await call(app, env, "/auth/refresh", { headers: { cookie: `__Secure-rt=${rt}` } });
    expect(after.status).toBe(401);
  });

  it("blocks refresh from a foreign origin (CSRF)", async () => {
    const login = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const rt = cookieValue(login, "__Secure-rt")!;
    const res = await app.fetch(
      new Request(`${ORIGIN}/auth/refresh`, { method: "POST", headers: { cookie: `__Secure-rt=${rt}`, origin: "https://evil.example" } }),
      env as never,
    );
    expect(res.status).toBe(403);
  });

  // Uses dummy finance creds — the REAL finance email/password live only in
  // Cloudflare secrets, never in the repo.
  const FIN_EMAIL = "finance-test@example";
  const FIN_PASS = "finance-test-pass-123";

  it("finance gate: rejects wrong creds, unlocks with correct creds", async () => {
    env.FINANCE_EMAIL = FIN_EMAIL;
    env.FINANCE_PASSWORD_HASH = await hashPassword(FIN_PASS, 10_000);
    const login = await call(app, env, "/auth/login", { body: JSON.stringify({ email: "admin@pensa.gctu", password: "Sup3rSecret!pw" }) });
    const at = cookieValue(login, "__Host-at")!;
    const finLogin = (body: unknown) =>
      app.fetch(new Request(`${ORIGIN}/auth/finance/login`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, cookie: `__Host-at=${at}` }, body: JSON.stringify(body) }), env as never);

    // wrong password → 401, no cookie
    const bad = await finLogin({ email: FIN_EMAIL, password: "nope" });
    expect(bad.status).toBe(401);
    expect(cookieValue(bad, "__Host-fin")).toBeNull();

    // correct creds → 200 + __Host-fin cookie
    const ok = await finLogin({ email: FIN_EMAIL, password: FIN_PASS });
    expect(ok.status).toBe(200);
    const fin = cookieValue(ok, "__Host-fin")!;
    expect(fin).toBeTruthy();

    // status endpoint reflects the unlock
    const status = await app.fetch(new Request(`${ORIGIN}/auth/finance/status`, { headers: { cookie: `__Host-fin=${fin}` } }), env as never);
    expect(((await status.json()) as { unlocked: boolean }).unlocked).toBe(true);
  });

  it("finance gate: requires an authenticated admin to even attempt unlock", async () => {
    env.FINANCE_EMAIL = FIN_EMAIL;
    env.FINANCE_PASSWORD_HASH = await hashPassword(FIN_PASS, 10_000);
    const res = await app.fetch(
      new Request(`${ORIGIN}/auth/finance/login`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email: FIN_EMAIL, password: FIN_PASS }) }),
      env as never,
    );
    expect(res.status).toBe(401); // no admin session
  });
});
