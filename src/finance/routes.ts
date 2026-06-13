// Finance API (mounted at /api/finance), JWT + RBAC guarded.
import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { authorize } from "../auth/context";
import { createEntry, listEntries, summary, CATEGORIES, METHODS, PLEDGE_STATUSES } from "./repository";

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
    notes: b.notes ?? null,
  });
  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, summary, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'finance.recorded', 'finance', ?, ?, datetime('now'))`,
  ).bind(c.get("userId"), res.id, `${b.category} ${b.amount}`).run();
  return c.json(res, 201);
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

export const financeRoutes = app;
