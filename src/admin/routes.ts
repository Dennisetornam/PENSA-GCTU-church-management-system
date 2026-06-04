// Admin API (mounted at /api). Registrations approval queue + members.
// Guarded by the interim admin-token middleware (Phase-1 JWT auth will replace it).

import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { approveRegistration, rejectRegistration, NotFoundError, ConflictError } from "../registration/approval";
import { listMembers, getMember, changeMemberStatus } from "../members/repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "validation_failed", issues: err.issues }, 400);
  console.error("admin error", err);
  return c.json({ error: "internal_error" }, 500);
});

const STATUSES = ["actual_member", "visitor", "associate", "alumni"] as const;

// ── Registrations ────────────────────────────────────────────────────────────
app.get("/registrations", authorize("registrations:review"), async (c) => {
  const status = c.req.query("status") ?? "pending";
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "25")));
  const { results } = await c.env.DB.prepare(
    `SELECT id, reference, status, full_name, phone_number, date_of_birth, possible_duplicate,
            duplicate_signals, submitted_at, profile_image_key
     FROM registrations WHERE status = ? ORDER BY submitted_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(status, limit, (page - 1) * limit)
    .all();
  return c.json({ results: results ?? [], page, limit });
});

app.get("/registrations/:id", authorize("registrations:review"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM registrations WHERE id = ? LIMIT 1")
    .bind(c.req.param("id"))
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ...row, payload: row.payload ? JSON.parse(row.payload as string) : null });
});

const approveSchema = z.object({ membershipStatus: z.enum(STATUSES).optional() });
app.post("/registrations/:id/approve", authorize("registrations:review"), async (c) => {
  const body = approveSchema.parse(await c.req.json().catch(() => ({})));
  try {
    const result = await approveRegistration(c.env, c.req.param("id"), {
      membershipStatus: body.membershipStatus,
      reviewedBy: c.get("userId"),
    });
    return c.json(result);
  } catch (e) {
    if (e instanceof NotFoundError) return c.json({ error: e.message }, 404);
    if (e instanceof ConflictError) return c.json({ error: e.message }, 409);
    throw e;
  }
});

const rejectSchema = z.object({ reason: z.string().min(1).max(500) });
app.post("/registrations/:id/reject", authorize("registrations:review"), async (c) => {
  const body = rejectSchema.parse(await c.req.json());
  try {
    await rejectRegistration(c.env, c.req.param("id"), body.reason, c.get("userId"));
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof ConflictError) return c.json({ error: e.message }, 409);
    throw e;
  }
});

// ── Members ──────────────────────────────────────────────────────────────────
app.get("/members", authorize("members:read"), async (c) => {
  const data = await listMembers(c.env.DB, {
    q: c.req.query("q"),
    status: c.req.query("status"),
    cellId: c.req.query("cellId"),
    departmentId: c.req.query("departmentId"),
    page: Number(c.req.query("page") ?? "1"),
    limit: Number(c.req.query("limit") ?? "25"),
  });
  return c.json(data);
});

app.get("/members/:id", authorize("members:read"), async (c) => {
  const member = await getMember(c.env.DB, c.req.param("id"));
  if (!member) return c.json({ error: "not found" }, 404);
  return c.json(member);
});

const statusChangeSchema = z.object({ status: z.enum(STATUSES), reason: z.string().max(500).optional() });
app.post("/members/:id/status", authorize("members:update"), async (c) => {
  const body = statusChangeSchema.parse(await c.req.json());
  await changeMemberStatus(c.env.DB, c.req.param("id"), body.status, body.reason ?? null, c.get("userId"));
  return c.json({ ok: true });
});

export const adminRoutes = app;
