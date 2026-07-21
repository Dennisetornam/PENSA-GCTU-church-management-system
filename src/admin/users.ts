// Admin user management (mounted at /api/users). Gated on users:manage.
// Super-admin accounts can only be created/altered by a super_admin.
import { Hono } from "hono";
import type { Context } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;
import { authorize } from "../auth/context";
import { hashPassword } from "../auth/password";
import { loginIdentifier } from "../auth/identifier";

const ROLE_ID: Record<string, string> = {
  super_admin: "role_super_admin",
  church_admin: "role_church_admin",
  department_leader: "role_dept_leader",
  cell_leader: "role_cell_leader",
};
const roleSchema = z.enum(["super_admin", "church_admin", "department_leader", "cell_leader"]);

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "validation_failed", issues: err.issues }, 400);
  console.error("users error", err);
  return c.json({ error: "internal_error" }, 500);
});

app.use("*", authorize("users:manage"));

// Block non-super-admins from touching super_admin accounts.
function guardSuper(c: Ctx, targetRole?: string): Response | null {
  if (c.get("role") === "super_admin") return null;
  if (targetRole === "super_admin") return c.json({ error: "only a super admin can manage super admins" }, 403);
  return null;
}

app.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, u.email, u.status, u.last_login_at, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC`,
  ).all();
  return c.json({ results: results ?? [] });
});

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: loginIdentifier,
  password: z.string().min(12).max(128),
  role: roleSchema,
});
app.post("/", async (c) => {
  const body = createSchema.parse(await c.req.json());
  const denied = guardSuper(c, body.role);
  if (denied) return denied;
  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ? AND deleted_at IS NULL").bind(body.email).first();
  if (exists) return c.json({ error: "a user with that email already exists" }, 409);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO users (id, full_name, email, password_hash, role_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
  ).bind(id, body.fullName, body.email, await hashPassword(body.password), ROLE_ID[body.role], now, now).run();
  await audit(c, "user.created", id, `role=${body.role}`);
  return c.json({ id, role: body.role }, 201);
});

app.post("/:id/role", async (c) => {
  const body = z.object({ role: roleSchema }).parse(await c.req.json());
  const target = await loadRole(c, c.req.param("id"));
  const denied = guardSuper(c, body.role) ?? guardSuper(c, target);
  if (denied) return denied;
  await c.env.DB.prepare("UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?")
    .bind(ROLE_ID[body.role], new Date().toISOString(), c.req.param("id")).run();
  await audit(c, "user.role_changed", c.req.param("id"), `role=${body.role}`);
  return c.json({ ok: true });
});

app.post("/:id/suspend", async (c) => setStatus(c, "suspended"));
app.post("/:id/activate", async (c) => setStatus(c, "active"));

const resetSchema = z.object({ newPassword: z.string().min(12).max(128) });
app.post("/:id/reset-password", async (c) => {
  const body = resetSchema.parse(await c.req.json());
  const target = await loadRole(c, c.req.param("id"));
  const denied = guardSuper(c, target);
  if (denied) return denied;
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?")
    .bind(await hashPassword(body.newPassword), now, c.req.param("id")).run();
  await c.env.DB.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(now, c.req.param("id")).run();
  await audit(c, "user.password_reset", c.req.param("id"));
  return c.json({ ok: true });
});

// helpers
async function loadRole(c: Ctx, id: string | undefined): Promise<string | undefined> {
  if (!id) return undefined;
  const row = await c.env.DB.prepare("SELECT r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?").bind(id).first<{ role: string }>();
  return row?.role;
}
async function setStatus(c: Ctx, status: "active" | "suspended") {
  const id = c.req.param("id");
  if (id === c.get("userId")) return c.json({ error: "you cannot change your own status" }, 400);
  const denied = guardSuper(c, await loadRole(c, id));
  if (denied) return denied;
  await c.env.DB.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
  if (status === "suspended") await c.env.DB.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(new Date().toISOString(), id).run();
  await audit(c, status === "suspended" ? "user.suspended" : "user.activated", id);
  return c.json({ ok: true });
}
async function audit(c: Ctx, action: string, entityId: string | undefined | null, summary?: string) {
  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, summary, created_at)
     VALUES (lower(hex(randomblob(16))), ?, ?, 'user', ?, ?, datetime('now'))`,
  ).bind(c.get("userId"), action, entityId ?? null, summary ?? null).run();
}

export const userRoutes = app;
