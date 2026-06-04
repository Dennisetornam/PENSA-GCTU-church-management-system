// Admin/leader authentication routes: login, refresh, logout, me.
// Members do not authenticate. CSRF for cookie POSTs is enforced via Origin check.
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { rateLimit, auditViolation } from "../rate-limit/middleware";
import { LIMIT_RULES } from "../rate-limit/config";
import { verifyPassword } from "./password";
import { signAccessToken } from "./jwt";
import { issueRefreshToken, rotateRefreshToken, revokeFamilyByToken, RefreshReuseError } from "./refresh";
import { getUserByEmail, resolveScope, resolveScopeByUserId } from "./scope";
import { getAuth } from "./context";
import { AT_COOKIE, RT_COOKIE, authCookie, csrfCookie, clearCookie, readCookie } from "./cookies";
import { randomToken } from "./crypto";

const AT_TTL = 900; // 15 min
const RT_TTL = 2_592_000; // 30 days
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1),
});

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client (no ambient cookies → no CSRF surface)
  return origin === new URL(req.url).origin;
}

async function audit(env: Env, action: string, userId: string | null, ip: string | null, ua: string | null) {
  await env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, ip, user_agent, created_at)
     VALUES (lower(hex(randomblob(16))), ?, ?, 'user', ?, ?, ?, datetime('now'))`,
  )
    .bind(userId, action, userId, ip, ua)
    .run();
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Login ────────────────────────────────────────────────────────────────────
app.post("/login", rateLimit(LIMIT_RULES.login, { onViolation: auditViolation }), async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const ua = c.req.header("user-agent") ?? null;
  const body = loginSchema.parse(await c.req.json());
  const unauthorized = () => c.json({ error: "invalid credentials" }, 401);

  const user = await getUserByEmail(c.env.DB, body.email);
  const locked = user?.locked_until && new Date(user.locked_until).getTime() > Date.now();
  const ok = user && user.status === "active" && !locked && (await verifyPassword(body.password, user.password_hash));

  if (!ok) {
    if (user) {
      const fails = (user.failed_login_count ?? 0) + 1;
      const lockUntil = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS).toISOString() : null;
      await c.env.DB.prepare("UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?")
        .bind(fails, lockUntil, user.id)
        .run();
    }
    await audit(c.env, "auth.login.failure", user?.id ?? null, ip, ua);
    return unauthorized();
  }

  await c.env.DB.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), user.id)
    .run();
  const scope = await resolveScope(c.env.DB, user);
  const access = await signAccessToken({ sub: user.id, role: user.role_name, scope }, c.env.JWT_SECRET);
  const { token: refresh } = await issueRefreshToken(c.env.DB, { userId: user.id, ip, userAgent: ua });
  await audit(c.env, "auth.login.success", user.id, ip, ua);

  c.header("set-cookie", authCookie(AT_COOKIE, access, AT_TTL), { append: true });
  c.header("set-cookie", authCookie(RT_COOKIE, refresh, RT_TTL, "/auth"), { append: true });
  c.header("set-cookie", csrfCookie(randomToken(24)), { append: true });
  return c.json({ ok: true, user: { id: user.id, name: user.full_name, role: user.role_name } });
});

// ── Refresh ──────────────────────────────────────────────────────────────────
app.post("/refresh", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "bad origin" }, 403);
  const rt = readCookie(c.req.raw, RT_COOKIE);
  if (!rt) return c.json({ error: "no refresh token" }, 401);
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  try {
    const { token, userId } = await rotateRefreshToken(c.env.DB, rt, { ip });
    const resolved = await resolveScopeByUserId(c.env.DB, userId);
    if (!resolved) return c.json({ error: "user gone" }, 401);
    const access = await signAccessToken({ sub: userId, role: resolved.role, scope: resolved.scope }, c.env.JWT_SECRET);
    await audit(c.env, "auth.token.refresh", userId, ip, null);
    c.header("set-cookie", authCookie(AT_COOKIE, access, AT_TTL), { append: true });
    c.header("set-cookie", authCookie(RT_COOKIE, token, RT_TTL, "/auth"), { append: true });
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof RefreshReuseError) {
      await audit(c.env, "auth.token.reuse_detected", null, ip, null);
      return c.json({ error: "session invalidated" }, 401);
    }
    throw e;
  }
});

// ── Logout ───────────────────────────────────────────────────────────────────
app.post("/logout", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "bad origin" }, 403);
  const rt = readCookie(c.req.raw, RT_COOKIE);
  if (rt) await revokeFamilyByToken(c.env.DB, rt);
  c.header("set-cookie", clearCookie(AT_COOKIE), { append: true });
  c.header("set-cookie", clearCookie(RT_COOKIE, "/auth"), { append: true });
  return c.json({ ok: true });
});

// ── Me ───────────────────────────────────────────────────────────────────────
app.get("/me", async (c) => {
  const auth = await getAuth(c.req.raw, c.env.JWT_SECRET);
  if (!auth) return c.json({ error: "unauthorized" }, 401);
  return c.json({ userId: auth.userId, role: auth.role, scope: auth.scope });
});

export const authRoutes = app;
