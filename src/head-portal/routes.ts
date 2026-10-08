// Department Head portal API, mounted at /api/head. Everything is scoped to the
// signed-in head's own department(s) — they never see other departments' data.
import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authorize, getAuth } from "../auth/context";
import { getHeadDepartments, getHeadMembers } from "./repository";
import { getMySubmissions } from "../semester-reports/repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

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

export const headRoutes = app;
