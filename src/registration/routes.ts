// Public registration endpoints, mounted at /register.
//   GET  /register/options   dropdown data
//   POST /register/draft     create/update draft (autosave)
//   GET  /register/draft     resume draft
//   POST /register/image     upload profile image -> R2 (draft-scoped)
//   GET  /register/image     stream a draft image (own token only)
//   POST /register           final submit -> Pending Approval

import { Hono } from "hono";
import type { Context } from "hono";
import { ZodError } from "zod";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, Variables } from "../types";
import { rateLimit, auditViolation } from "../rate-limit/middleware";
import { LIMIT_RULES } from "../rate-limit/config";
import { verifyTurnstile } from "../auth/turnstile";
import { getRegistrationOptions } from "./options";
import { draftSchema, submitSchema } from "./schemas";
import { getDraft, upsertDraft, attachDraftImage, submitRegistration } from "./repository";

const DRAFT_COOKIE = "pensa_reg_draft";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const deps = { onViolation: auditViolation };

type AppCtx = Context<{ Bindings: Env; Variables: Variables }>;

function ensureDraftToken(c: AppCtx): string {
  let token = getCookie(c, DRAFT_COOKIE);
  if (!token) {
    token = crypto.randomUUID();
    setCookie(c, DRAFT_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/register",
      maxAge: 7 * 24 * 60 * 60,
    });
  }
  return token;
}

function detectImage(buf: Uint8Array): { type: string; ext: string } | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return { type: "image/png", ext: "png" };
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return { type: "image/webp", ext: "webp" };
  return null;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: "validation_failed", issues: err.issues }, 400);
  }
  console.error("registration error", err);
  return c.json({ error: "internal_error" }, 500);
});

// Dropdown options
app.get("/options", async (c) => c.json(await getRegistrationOptions(c.env.DB)));

// Save / update draft
app.post("/draft", rateLimit(LIMIT_RULES.registerDraft, deps), async (c) => {
  const token = ensureDraftToken(c);
  const data = draftSchema.parse(await c.req.json());
  await upsertDraft(c.env.DB, token, data);
  return c.json({ ok: true });
});

// Resume draft
app.get("/draft", async (c) => {
  const token = getCookie(c, DRAFT_COOKIE);
  if (!token) return c.json({ draft: null });
  return c.json({ draft: await getDraft(c.env.DB, token) });
});

// Upload profile image
app.post("/image", rateLimit(LIMIT_RULES.registerImage, deps), async (c) => {
  const token = ensureDraftToken(c);
  const form = await c.req.formData();
  const raw = form.get("file");
  if (raw === null || typeof raw === "string") return c.json({ error: "no file" }, 400);
  const file = raw as unknown as Blob;
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) return c.json({ error: "image too large (max 5MB)" }, 413);
  const kind = detectImage(buf);
  if (!kind) return c.json({ error: "unsupported image type" }, 415);
  const key = `registrations/drafts/${token}/${crypto.randomUUID()}.${kind.ext}`;
  await c.env.MEDIA!.put(key, buf, { httpMetadata: { contentType: kind.type } });
  await attachDraftImage(c.env.DB, token, key);
  return c.json({ key, previewUrl: `/register/image?key=${encodeURIComponent(key)}` });
});

// Stream a draft image (only the owner's token may read it)
app.get("/image", async (c) => {
  const token = getCookie(c, DRAFT_COOKIE);
  const key = c.req.query("key");
  if (!token || !key || !key.startsWith(`registrations/drafts/${token}/`))
    return c.json({ error: "forbidden" }, 403);
  const obj = await c.env.MEDIA!.get(key);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: { "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream" },
  });
});

// Final submit
app.post("/", rateLimit(LIMIT_RULES.register, deps), async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? undefined;
  const ua = c.req.header("user-agent") ?? null;
  const data = submitSchema.parse(await c.req.json());

  if (!(await verifyTurnstile(data.turnstileToken, c.env.TURNSTILE_SECRET, ip)))
    return c.json({ error: "verification failed" }, 400);

  const token = getCookie(c, DRAFT_COOKIE) ?? null;
  const year = new Date().getUTCFullYear().toString();
  const { reference, possibleDuplicate } = await submitRegistration(c.env.DB, data, token, year);

  deleteCookie(c, DRAFT_COOKIE, { path: "/register" });
  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, action, entity_type, summary, ip, user_agent, created_at)
     VALUES (lower(hex(randomblob(16))), 'registration.submitted', 'registration', ?, ?, ?, datetime('now'))`,
  )
    .bind(`reference=${reference} possible_duplicate=${possibleDuplicate}`, ip ?? null, ua)
    .run();

  return c.json({ reference, status: "pending_approval" });
});

export const registrationRoutes = app;
