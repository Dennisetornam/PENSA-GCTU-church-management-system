// Departmental semester reports API, mounted at /api/dept-reports. JWT + RBAC.
import { Hono } from "hono";
import type { Context } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { getAuth } from "../auth/context";
import {
  createPeriod, listPeriods, updatePeriod, deletePeriod, closePeriod, reopenPeriod, getPeriod, getPeriodBoard,
  submitReport, getReport, getMySubmissions,
} from "./repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "validation_failed", issues: err.issues }, 400);
  console.error("dept-reports error", err);
  return c.json({ error: "internal_error" }, 500);
});

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const DOC_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// ── Periods (admin / president) ────────────────────────────────────────────────
const periodSchema = z.object({
  name: z.string().trim().min(2).max(120),
  academicYear: z.string().trim().max(20).optional().nullable(),
  term: z.string().trim().max(40).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

app.post("/periods", authorize("reports:manage"), async (c) => {
  const b = periodSchema.parse(await c.req.json());
  const res = await createPeriod(c.env.DB, { ...b, createdBy: c.get("userId") });
  return c.json(res, 201);
});

app.get("/periods", authorize("reports:view"), async (c) => c.json(await listPeriods(c.env.DB)));

app.patch("/periods/:id", authorize("reports:manage"), async (c) => {
  const b = periodSchema.parse(await c.req.json());
  const ok = await updatePeriod(c.env.DB, c.req.param("id"), b);
  return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

app.delete("/periods/:id", authorize("reports:manage"), async (c) => {
  const ok = await deletePeriod(c.env.DB, c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

app.post("/periods/:id/close", authorize("reports:manage"), async (c) => {
  const ok = await closePeriod(c.env.DB, c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "not found or already closed" }, 404);
});

app.post("/periods/:id/reopen", authorize("reports:manage"), async (c) => {
  const ok = await reopenPeriod(c.env.DB, c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "not found or already open" }, 404);
});

app.get("/periods/:id/board", authorize("reports:manage"), async (c) => {
  const period = await getPeriod(c.env.DB, c.req.param("id"));
  if (!period) return c.json({ error: "not found" }, 404);
  const results = await getPeriodBoard(c.env.DB, c.req.param("id"));
  return c.json({ period, results });
});

// ── Submission (department heads + admins) ──────────────────────────────────────
// A department head's own departments (empty for admins/president, who may submit for any).
async function scopedDepartments(c: Context<{ Bindings: Env; Variables: Variables }>): Promise<{ role: string; departments: string[] }> {
  const auth = await getAuth(c.req.raw, c.env.JWT_SECRET);
  return { role: auth?.role ?? "", departments: auth?.scope.departments ?? [] };
}

app.post("/upload", authorize("reports:submit"), async (c) => {
  const form = await c.req.formData();
  const raw = form.get("file");
  if (raw === null || typeof raw === "string") return c.json({ error: "no file" }, 400);
  const file = raw as unknown as File;
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return c.json({ error: "file too large (max 15MB)" }, 413);
  const ext = (file.name?.split(".").pop() ?? "").toLowerCase();
  const type = DOC_TYPES[ext];
  if (!type) return c.json({ error: "unsupported file — upload a PDF or Word document" }, 415);
  const key = `reports/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA!.put(key, buf, { httpMetadata: { contentType: type } });
  return c.json({ key, fileName: file.name ?? `report.${ext}` }, 201);
});

const submitSchema = z.object({
  periodId: z.string().min(1),
  departmentId: z.string().min(1),
  fileKey: z.string().max(300).optional().nullable(),
  fileName: z.string().max(260).optional().nullable(),
  summary: z.string().max(4000).optional().nullable(),
});

app.post("/submit", authorize("reports:submit"), async (c) => {
  const b = submitSchema.parse(await c.req.json());
  const { role, departments } = await scopedDepartments(c);
  // Department leaders may only submit for a department they lead.
  if (role === "department_leader" && !departments.includes(b.departmentId))
    return c.json({ error: "forbidden" }, 403);
  const period = await getPeriod(c.env.DB, b.periodId) as { status?: string } | null;
  if (!period) return c.json({ error: "period not found" }, 404);
  if (period.status !== "open") return c.json({ error: "this reporting period is closed" }, 409);
  if (!b.fileKey && !b.summary) return c.json({ error: "attach a report file or write a summary" }, 400);
  const res = await submitReport(c.env.DB, { ...b, submittedBy: c.get("userId") });
  return c.json(res, 201);
});

app.get("/mine", authorize("reports:submit"), async (c) => {
  const { departments } = await scopedDepartments(c);
  return c.json(await getMySubmissions(c.env.DB, departments));
});

app.get("/:id/file", authorize("reports:view"), async (c) => {
  const report = await getReport(c.env.DB, c.req.param("id"));
  if (!report || !report.file_key) return c.json({ error: "not found" }, 404);
  // Department leaders may only download their own department's report.
  const { role, departments } = await scopedDepartments(c);
  if (role === "department_leader" && !departments.includes(report.department_id))
    return c.json({ error: "forbidden" }, 403);
  const obj = await c.env.MEDIA!.get(report.file_key);
  if (!obj) return c.json({ error: "not found" }, 404);
  const safeName = (report.file_name ?? "report").replace(/[^\w.\-() ]/g, "_");
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
    },
  });
});

export const deptReportRoutes = app;
