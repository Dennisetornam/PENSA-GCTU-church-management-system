// Central rate-limit policy. Add a new endpoint by adding a rule here — the
// Durable Object and middleware are generic, so no architecture change is needed
// to expand coverage (future-proofing requirement).

export type LimitScope = "ip" | "user";

export interface LimitRule {
  /** Stable identifier used in the counter key and audit logs. */
  name: string;
  /** Max actions per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Whether the limit is keyed by client IP or authenticated admin user. */
  scope: LimitScope;
}

const HOUR = 60 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

export const LIMIT_RULES = {
  // 1. Public Member Registration — 10 submissions / hour / IP
  register: { name: "register", limit: 10, windowMs: HOUR, scope: "ip" },

  // 2. Admin Login — 5 attempts / 15 minutes / IP
  login: { name: "login", limit: 5, windowMs: FIFTEEN_MIN, scope: "ip" },

  // 3. Member Search / Check-In — 300 searches / hour / admin user (anti-scraping)
  checkin: { name: "checkin", limit: 300, windowMs: HOUR, scope: "user" },

  // 4. Attendance Submission — 500 actions / hour / admin user
  attendance: { name: "attendance", limit: 500, windowMs: HOUR, scope: "user" },
} as const satisfies Record<string, LimitRule>;

export type LimitName = keyof typeof LIMIT_RULES;
