// Attendance API (mounted at /api/attendance), JWT + RBAC guarded.
import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { rateLimit, auditViolation } from "../rate-limit/middleware";
import { LIMIT_RULES } from "../rate-limit/config";

const rl = { onViolation: auditViolation };
import {
  createSession, listSessions, getSession, getRoster, markAttendance, closeSession,
  checkInByQr, getMemberAttendance, NotFoundError, ConflictError,
} from "./repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "validation_failed", issues: err.issues }, 400);
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
  console.error("attendance error", err);
  return c.json({ error: "internal_error" }, 500);
});

const createSchema = z.object({
  gatheringTypeId: z.string().min(1),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(120).optional(),
});
const status = z.enum(["present", "late", "excused", "absent"]);
const marksSchema = z.object({ marks: z.array(z.object({ memberId: z.string().min(1), status })).min(1) });
const checkInSchema = z.object({ token: z.string().min(1), sessionId: z.string().min(1) });

app.post("/sessions", authorize("attendance:record"), async (c) => {
  const body = createSchema.parse(await c.req.json());
  const res = await createSession(c.env.DB, { ...body, recordedBy: c.get("userId") });
  return c.json(res, res.reused ? 200 : 201);
});

app.get("/sessions", authorize("attendance:read"), async (c) => {
  return c.json(await listSessions(c.env.DB, {
    gatheringTypeId: c.req.query("gatheringTypeId"),
    page: Number(c.req.query("page") ?? "1"),
    limit: Number(c.req.query("limit") ?? "25"),
  }));
});

app.get("/sessions/:id", authorize("attendance:read"), async (c) => {
  const s = await getSession(c.env.DB, c.req.param("id"));
  if (!s) return c.json({ error: "not found" }, 404);
  return c.json(s);
});

app.get("/sessions/:id/roster", authorize("attendance:read"), rateLimit(LIMIT_RULES.checkin, rl), async (c) => {
  return c.json(await getRoster(c.env.DB, c.req.param("id"), {
    cellId: c.req.query("cellId"),
    departmentId: c.req.query("departmentId"),
    q: c.req.query("q"),
    page: Number(c.req.query("page") ?? "1"),
    limit: Number(c.req.query("limit") ?? "200"),
  }));
});

app.put("/sessions/:id/records", authorize("attendance:record"), rateLimit(LIMIT_RULES.attendance, rl), async (c) => {
  const body = marksSchema.parse(await c.req.json());
  const res = await markAttendance(c.env.DB, c.req.param("id"), body.marks, "manual", c.get("userId"));
  return c.json(res);
});

app.post("/sessions/:id/close", authorize("attendance:record"), async (c) => {
  await closeSession(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/check-in", authorize("attendance:record"), rateLimit(LIMIT_RULES.checkin, rl), async (c) => {
  const body = checkInSchema.parse(await c.req.json());
  const res = await checkInByQr(c.env.DB, body.sessionId, body.token, c.env.JWT_SECRET, "qr");
  return c.json(res);
});

app.get("/members/:id", authorize("attendance:read"), async (c) => {
  return c.json(await getMemberAttendance(c.env.DB, c.req.param("id")));
});

export const attendanceRoutes = app;
