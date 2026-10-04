// PENSA GCTU CMS — Worker entry. Mounts the Hono sub-apps for each module.
import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { RateLimiter } from "./rate-limit/rate-limiter.do";
import { registrationRoutes } from "./registration/routes";
import { adminRoutes } from "./admin/routes";
import { userRoutes } from "./admin/users";
import { authRoutes } from "./auth/routes";
import { attendanceRoutes } from "./attendance/routes";
import { analyticsRoutes } from "./analytics/routes";
import { reportRoutes } from "./reports/routes";
import { financeRoutes } from "./finance/routes";
import { helpDeskRoutes } from "./helpdesk/routes";
import { deptReportRoutes } from "./semester-reports/routes";
import { campusConfig } from "./config/campus";

// The Durable Object class must be exported from the Worker entry module.
export { RateLimiter };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/healthz", (c) => c.json({ status: "ok" }));

// Public campus config (branding + feature flags) for the SPA shell.
app.get("/config", (c) => c.json({ campus: campusConfig(c.env) }));

// Public member registration (QR) — multi-step + draft + image + submit
app.route("/register", registrationRoutes);

// Public Help Desk intake (campus-gated inside the router)
app.route("/help-desk", helpDeskRoutes);

// Admin/leader authentication — login (5/15min/IP), refresh, logout, me
app.route("/auth", authRoutes);

// Admin API (JWT + RBAC) — registrations approval queue + members
app.route("/api", adminRoutes);

// Admin user management (super_admin / church_admin)
app.route("/api/users", userRoutes);

// Attendance — sessions, manual + QR marking, history (JWT + RBAC, rate-limited)
app.route("/api/attendance", attendanceRoutes);

// Analytics — KPIs, distributions, baptism, attendance & growth trends (JWT + RBAC)
app.route("/api/analytics", analyticsRoutes);

// Reporting — members roster, attendance summary, inactive members (CSV/Excel/JSON)
app.route("/api/reports", reportRoutes);

// Finance — record giving per service (offerings, tithes, pledges, etc.)
app.route("/api/finance", financeRoutes);

// Departmental semester reports (periods + per-department submissions)
app.route("/api/dept-reports", deptReportRoutes);

export default app;
