// Public Help Desk intake, mounted at /help-desk. Campus-gated: returns 404
// where the help-desk feature is off (and where the table may not exist).
import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { Env, Variables } from "../types";
import { rateLimit, auditViolation } from "../rate-limit/middleware";
import { LIMIT_RULES } from "../rate-limit/config";
import { campusConfig } from "../config/campus";
import { HELP_CATEGORIES, createTicket } from "./repository";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const deps = { onViolation: auditViolation };

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "validation_failed", issues: err.issues }, 400);
  console.error("helpdesk error", err);
  return c.json({ error: "internal_error" }, 500);
});

// Block the whole router where the feature is off.
app.use("*", async (c, next) => {
  if (!campusConfig(c.env).features.helpDesk) return c.json({ error: "not found" }, 404);
  await next();
});

const submitSchema = z.object({
  category: z.enum(HELP_CATEGORIES).default("enquiry"),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(5, "please write a little more").max(4000),
  isAnonymous: z.boolean().default(false),
  name: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(60).optional(),
});

app.post("/submit", rateLimit(LIMIT_RULES.register, deps), async (c) => {
  const b = submitSchema.parse(await c.req.json());
  const { reference } = await createTicket(c.env.DB, {
    category: b.category,
    subject: b.subject ?? null,
    message: b.message,
    isAnonymous: b.isAnonymous,
    name: b.name ?? null,
    contact: b.contact ?? null,
  });
  return c.json({ ok: true, reference }, 201);
});

export const helpDeskRoutes = app;
