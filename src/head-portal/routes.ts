// Department Head portal API, mounted at /api/head. Everything is scoped to the
// signed-in head's own department(s) — they never see other departments' data.
import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { authorize, getAuth } from "../auth/context";
import { getHeadDepartments, getHeadMembers } from "./repository";
import { getMySubmissions } from "../semester-reports/repository";
import { listTickets, updateTicket, ticketInDepartments, HELP_STATUSES } from "../helpdesk/repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "validation_failed", issues: err.issues }, 400);
  console.error("head error", err);
  return c.json({ error: "internal_error" }, 500);
});

async function myDepartments(c: { req: { raw: Request }; env: Env }): Promise<string[]> {
  const auth = await getAuth(c.req.raw, c.env.JWT_SECRET);
  return auth?.scope.departments ?? [];
}

// Home: the head's departments (+ counts) and the open report period / status.
app.get("/overview", authorize("reports:view"), async (c) => {
  const deptIds = await myDepartments(c);
  const [departments, reports] = await Promise.all([
    getHeadDepartments(c.env.DB, deptIds),
    getMySubmissions(c.env.DB, deptIds),
  ]);
  return c.json({ departments, period: reports.period, submissions: reports.departments });
});

// The head's members (scoped) with a read-only attendance summary.
app.get("/members", authorize("members:read"), async (c) => {
  const deptIds = await myDepartments(c);
  return c.json({ results: await getHeadMembers(c.env.DB, deptIds) });
});

// Help Desk tickets routed to the head's department(s).
app.get("/help-desk", authorize("reports:view"), async (c) => {
  const deptIds = await myDepartments(c);
  return c.json(await listTickets(c.env.DB, { status: c.req.query("status"), departmentIds: deptIds }));
});

const patchSchema = z.object({ status: z.enum(HELP_STATUSES).optional(), adminNotes: z.string().max(2000).optional().nullable() });
app.patch("/help-desk/:id", authorize("reports:view"), async (c) => {
  const deptIds = await myDepartments(c);
  if (!(await ticketInDepartments(c.env.DB, c.req.param("id"), deptIds))) return c.json({ error: "not found" }, 404);
  const b = patchSchema.parse(await c.req.json());
  await updateTicket(c.env.DB, c.req.param("id"), { status: b.status, adminNotes: b.adminNotes, handledBy: b.status ? c.get("userId") : undefined });
  return c.json({ ok: true });
});

export const headRoutes = app;
