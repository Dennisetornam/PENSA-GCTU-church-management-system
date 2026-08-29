// Admin API (mounted at /api). Registrations approval queue + members.
// Guarded by the interim admin-token middleware (Phase-1 JWT auth will replace it).

import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { approveRegistration, rejectRegistration, NotFoundError, ConflictError } from "../registration/approval";
import { listMembers, membersForExport, getMember, changeMemberStatus, updateMember } from "../members/repository";
import { normalizeGhanaPhone } from "../registration/schemas";
import { thumbKeyOf } from "../media/image";
import { toXlsxSheets } from "../reports/format";

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
    gender: c.req.query("gender"),
    cellId: c.req.query("cellId"),
    departmentId: c.req.query("departmentId"),
    page: Number(c.req.query("page") ?? "1"),
    limit: Number(c.req.query("limit") ?? "25"),
  });
  return c.json(data);
});

// Birthdays — members born in a given month (1–12), for sending greetings.
// Registered before /members/:id so "birthdays" isn't treated as an id.
app.get("/members/birthdays", authorize("members:read"), async (c) => {
  const month = Number(c.req.query("month") ?? "0");
  const mm = month >= 1 && month <= 12 ? String(month).padStart(2, "0") : null;
  const where = ["deleted_at IS NULL", "registration_status = 'approved'", "date_of_birth IS NOT NULL"];
  const args: unknown[] = [];
  if (mm) { where.push("substr(date_of_birth, 6, 2) = ?"); args.push(mm); }
  const { results } = await c.env.DB.prepare(
    `SELECT id, member_code, full_name, date_of_birth, phone_number, whatsapp_number
     FROM members WHERE ${where.join(" AND ")}
     ORDER BY substr(date_of_birth, 9, 2) ASC, full_name ASC`,
  ).bind(...args).all();
  return c.json({ month: mm ? month : null, results: results ?? [] });
});

// Export members (optionally by gender/status) to an Excel workbook with one
// sheet per cell. Registered before /members/:id so "export" isn't an id.
app.get("/members/export", authorize("members:read"), async (c) => {
  const gender = c.req.query("gender");
  const status = c.req.query("status");
  const rows = await membersForExport(c.env.DB, { gender: gender || undefined, status: status || undefined });

  const byCell = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCell.get(r.cell_name) ?? [];
    list.push(r);
    byCell.set(r.cell_name, list);
  }
  const columns = [
    { key: "full_name", label: "Name" },
    { key: "member_code", label: "Member ID" },
    { key: "phone_number", label: "Phone" },
    { key: "whatsapp_number", label: "WhatsApp" },
    { key: "gender", label: "Gender" },
    { key: "membership_status", label: "Status" },
    { key: "cell_name", label: "Cell" },
  ];
  const sheets = [...byCell.entries()].map(([name, list]) => ({ name, columns, rows: list as unknown as Record<string, unknown>[] }));
  const buf = toXlsxSheets(sheets);
  const label = gender ? gender : "members";
  return new Response(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${label}-by-cell.xlsx"`,
    },
  });
});

app.get("/members/:id", authorize("members:read"), async (c) => {
  const member = await getMember(c.env.DB, c.req.param("id"));
  if (!member) return c.json({ error: "not found" }, 404);
  return c.json(member);
});

// Stream a member's profile photo from R2. ?variant=thumb serves the small
// thumbnail (fast); default serves the full image (for the click-to-zoom view).
app.get("/members/:id/photo", authorize("members:read"), async (c) => {
  const row = await c.env.DB.prepare("SELECT profile_picture_key FROM members WHERE id = ? AND deleted_at IS NULL")
    .bind(c.req.param("id")).first<{ profile_picture_key: string | null }>();
  const key = row?.profile_picture_key;
  if (!key) return c.json({ error: "no photo" }, 404);

  let obj = null;
  if (c.req.query("variant") === "thumb") obj = await c.env.MEDIA!.get(thumbKeyOf(key));
  if (!obj) obj = await c.env.MEDIA!.get(key); // fall back to full (older members have no thumb)
  if (!obj) return c.json({ error: "not found" }, 404);

  return new Response(obj.body, {
    headers: { "content-type": obj.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=86400" },
  });
});

// Update / edit a member (super_admin / church_admin / scoped leader)
const memberUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  otherNames: z.string().max(60).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(["male", "female"]).optional().nullable(),
  programmeId: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  residenceStatus: z.enum(["hostel_resident", "non_resident"]).optional().nullable(),
  residenceDetail: z.string().max(200).optional().nullable(),
  vacationResidence: z.string().max(200).optional().nullable(),
  cellId: z.string().optional().nullable(),
  holyGhostBaptism: z.boolean(),
  holyGhostBaptismDate: z.string().optional().nullable(),
  waterBaptism: z.boolean(),
  waterBaptismDate: z.string().optional().nullable(),
  phoneNumber: z.string().min(7).transform(normalizeGhanaPhone),
  whatsappNumber: z.string().optional().nullable(),
  membershipStatus: z.enum(STATUSES),
  departmentIds: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional().nullable(),
});
app.post("/members/:id", authorize("members:update"), async (c) => {
  const body = memberUpdateSchema.parse(await c.req.json());
  try {
    await updateMember(c.env.DB, c.req.param("id"), body, c.get("userId"));
  } catch (e) {
    const msg = String((e as Error).message || "");
    if (msg.includes("not found")) return c.json({ error: "member not found" }, 404);
    if (msg.toUpperCase().includes("UNIQUE")) return c.json({ error: "that phone number belongs to another member" }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

const statusChangeSchema = z.object({ status: z.enum(STATUSES), reason: z.string().max(500).optional() });
app.post("/members/:id/status", authorize("members:update"), async (c) => {
  const body = statusChangeSchema.parse(await c.req.json());
  await changeMemberStatus(c.env.DB, c.req.param("id"), body.status, body.reason ?? null, c.get("userId"));
  return c.json({ ok: true });
});

export const adminRoutes = app;
