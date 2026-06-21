// Analytics API (mounted at /api/analytics), JWT + RBAC guarded.
import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { getSummary, getDistribution, getBaptism, getUnbaptized, getAttendanceTrend, getGrowth, getPersonalityOfWeek } from "./repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/summary", authorize("analytics:view"), async (c) => c.json(await getSummary(c.env.DB)));

// Personality of the Week — most attendances in the last 7 days.
app.get("/personality", authorize("analytics:view"), async (c) => c.json({ member: await getPersonalityOfWeek(c.env.DB) }));

app.get("/distribution", authorize("analytics:view"), async (c) => {
  const dim = c.req.query("dimension");
  if (dim !== "cell" && dim !== "department" && dim !== "programme") {
    return c.json({ error: "dimension must be cell|department|programme" }, 400);
  }
  return c.json({ dimension: dim, results: await getDistribution(c.env.DB, dim) });
});

app.get("/baptism", authorize("analytics:view"), async (c) => c.json(await getBaptism(c.env.DB)));

// Members yet to receive a baptism (type = holy_ghost | water).
app.get("/unbaptized", authorize("analytics:view"), async (c) => {
  const type = c.req.query("type");
  if (type !== "holy_ghost" && type !== "water") return c.json({ error: "type must be holy_ghost|water" }, 400);
  return c.json({ type, results: await getUnbaptized(c.env.DB, type) });
});

app.get("/attendance-trend", authorize("analytics:view"), async (c) =>
  c.json({ results: await getAttendanceTrend(c.env.DB, { gatheringTypeId: c.req.query("gatheringTypeId"), limit: Number(c.req.query("limit") ?? "90") }) }),
);

app.get("/growth", authorize("analytics:view"), async (c) =>
  c.json({ results: await getGrowth(c.env.DB, { limit: Number(c.req.query("limit") ?? "180") }) }),
);

export const analyticsRoutes = app;
