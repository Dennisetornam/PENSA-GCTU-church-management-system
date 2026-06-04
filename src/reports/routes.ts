// Reports API (mounted at /api/reports), JWT + RBAC guarded.
//   GET /api/reports/:type?format=json|csv|xlsx&...
import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { getReport, type ReportType } from "./repository";
import { toCsv, toXlsx } from "./format";

const TYPES = new Set<ReportType>(["members", "attendance-summary", "inactive-members"]);

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/:type", authorize("reports:view"), async (c) => {
  const type = c.req.param("type") as ReportType;
  if (!TYPES.has(type)) return c.json({ error: "unknown report type" }, 404);
  const format = c.req.query("format") ?? "json";

  const report = await getReport(c.env.DB, type, c.req.query());
  if (!report) return c.json({ error: "unknown report type" }, 404);

  if (format === "json") return c.json(report);

  if (format === "csv") {
    return new Response(toCsv(report.columns, report.rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${type}.csv"` },
    });
  }

  if (format === "xlsx") {
    const buf = toXlsx(report.title, report.columns, report.rows);
    return new Response(buf, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${type}.xlsx"`,
      },
    });
  }

  return c.json({ error: "format must be json|csv|xlsx" }, 400);
});

export const reportRoutes = app;
