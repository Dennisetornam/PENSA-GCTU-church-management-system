// Finance API (mounted at /api/finance), JWT + RBAC guarded.
import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { detectImage, MAX_IMAGE_BYTES } from "../media/image";
import { createEntry, updateEntry, getEntry, listEntries, summary, quotaByMonth, QUOTA_RATE, CATEGORIES, METHODS, PLEDGE_STATUSES } from "./repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "validation_failed", issues: err.issues }, 400);
  console.error("finance error", err);
  return c.json({ error: "internal_error" }, 500);
});

const createSchema = z
  .object({
    category: z.enum(CATEGORIES),
    amount: z.number().positive().max(100_000_000), // GHS
    currency: z.string().length(3).optional(),
    serviceTypeId: z.string().optional().nullable(),
    paymentMethod: z.enum(METHODS).optional().nullable(),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    memberId: z.string().optional().nullable(),
    memberName: z.string().trim().max(120).optional().nullable(),
    pledgeStatus: z.enum(PLEDGE_STATUSES).optional().nullable(),
    sessionId: z.string().optional().nullable(),
    referenceImageKey: z.string().max(200).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  })
  // tithes & pledges must name the giver; pledges must state redemption
  .superRefine((v, ctx) => {
    if ((v.category === "tithe" || v.category === "pledge") && !v.memberName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["memberName"], message: "Member name is required for tithes and pledges" });
    }
    if (v.category === "pledge" && !v.pledgeStatus) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pledgeStatus"], message: "Pledge redemption status is required" });
    }
  });

app.post("/", authorize("finance:manage"), async (c) => {
  const b = createSchema.parse(await c.req.json());
  const res = await createEntry(c.env.DB, {
    category: b.category,
    amountMinor: Math.round(b.amount * 100),
    currency: b.currency ?? "GHS",
    serviceTypeId: b.serviceTypeId ?? null,
    paymentMethod: b.paymentMethod ?? null,
    occurredOn: b.occurredOn,
    recordedBy: c.get("userId"),
    memberId: b.memberId ?? null,
    // only carry giver attribution for member-linked categories
    memberName: b.category === "tithe" || b.category === "pledge" ? b.memberName ?? null : null,
    pledgeStatus: b.category === "pledge" ? b.pledgeStatus ?? null : null,
    sessionId: b.sessionId ?? null,
    // a reference screenshot only makes sense for Momo offerings
    referenceImageKey: b.category === "offering_momo" ? b.referenceImageKey ?? null : null,
    notes: b.notes ?? null,
  });
  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, summary, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'finance.recorded', 'finance', ?, ?, datetime('now'))`,
  ).bind(c.get("userId"), res.id, `${b.category} ${b.amount}`).run();
  return c.json(res, 201);
});

// Edit an existing entry (correct a mistake in the figures/details).
app.put("/:id", authorize("finance:manage"), async (c) => {
  const id = c.req.param("id");
  const existing = await getEntry(c.env.DB, id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const b = createSchema.parse(await c.req.json());
  await updateEntry(c.env.DB, id, {
    category: b.category,
    amountMinor: Math.round(b.amount * 100),
    currency: b.currency ?? "GHS",
    serviceTypeId: b.serviceTypeId ?? null,
    paymentMethod: b.paymentMethod ?? null,
    occurredOn: b.occurredOn,
    memberId: b.memberId ?? null,
    memberName: b.category === "tithe" || b.category === "pledge" ? b.memberName ?? null : null,
    pledgeStatus: b.category === "pledge" ? b.pledgeStatus ?? null : null,
    referenceImageKey: b.category === "offering_momo" ? b.referenceImageKey ?? null : null,
    notes: b.notes ?? null,
  });
  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, summary, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'finance.updated', 'finance', ?, ?, datetime('now'))`,
  ).bind(c.get("userId"), id, `${b.category} ${b.amount}`).run();
  return c.json({ ok: true });
});

app.get("/", authorize("finance:view"), async (c) =>
  c.json(await listEntries(c.env.DB, {
    category: c.req.query("category"),
    from: c.req.query("from"),
    to: c.req.query("to"),
    serviceTypeId: c.req.query("serviceTypeId"),
    sessionId: c.req.query("sessionId"),
    page: Number(c.req.query("page") ?? "1"),
    limit: Number(c.req.query("limit") ?? "50"),
  })),
);

app.get("/summary", authorize("finance:view"), async (c) =>
  c.json(await summary(c.env.DB, { from: c.req.query("from"), to: c.req.query("to") })),
);

// Monthly sector quota (15% of offerings + tithes).
app.get("/quota", authorize("finance:view"), async (c) =>
  c.json({ rate: QUOTA_RATE, results: await quotaByMonth(c.env.DB) }),
);

// Upload a Momo transaction-reference screenshot to R2; returns its key.
app.post("/image", authorize("finance:manage"), async (c) => {
  const form = await c.req.formData();
  const raw = form.get("file");
  if (raw === null || typeof raw === "string") return c.json({ error: "no file" }, 400);
  const buf = new Uint8Array(await (raw as unknown as Blob).arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) return c.json({ error: "image too large (max 5MB)" }, 413);
  const kind = detectImage(buf);
  if (!kind) return c.json({ error: "unsupported image type" }, 415);
  const key = `finance/momo/${crypto.randomUUID()}.${kind.ext}`;
  await c.env.MEDIA!.put(key, buf, { httpMetadata: { contentType: kind.type } });
  return c.json({ key, url: `/api/finance/image?key=${encodeURIComponent(key)}` }, 201);
});

// Stream a finance reference image from R2 (finance:view).
app.get("/image", authorize("finance:view"), async (c) => {
  const key = c.req.query("key");
  if (!key || !key.startsWith("finance/")) return c.json({ error: "forbidden" }, 403);
  const obj = await c.env.MEDIA!.get(key);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: { "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, max-age=3600" },
  });
});

export const financeRoutes = app;
