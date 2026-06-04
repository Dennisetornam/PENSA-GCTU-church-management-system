// PENSA GCTU CMS — Worker entry. Mounts the Hono sub-apps for each module.
import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { RateLimiter } from "./rate-limit/rate-limiter.do";
import { registrationRoutes } from "./registration/routes";
import { adminRoutes } from "./admin/routes";
import { authRoutes } from "./auth/routes";
import { attendanceRoutes } from "./attendance/routes";

// The Durable Object class must be exported from the Worker entry module.
export { RateLimiter };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/healthz", (c) => c.json({ status: "ok" }));

// Public member registration (QR) — multi-step + draft + image + submit
app.route("/register", registrationRoutes);

// Admin/leader authentication — login (5/15min/IP), refresh, logout, me
app.route("/auth", authRoutes);

// Admin API (JWT + RBAC) — registrations approval queue + members
app.route("/api", adminRoutes);

// Attendance — sessions, manual + QR marking, history (JWT + RBAC, rate-limited)
app.route("/api/attendance", attendanceRoutes);

export default app;
