// Typed role → permission map for the 4 authenticating roles (members do not log in).
export type Scope = "all" | "department" | "cell";
export type Role = "super_admin" | "church_admin" | "department_leader" | "cell_leader";
export type Permission =
  | "members:create" | "members:read" | "members:update" | "members:delete"
  | "attendance:record" | "attendance:read"
  | "events:manage" | "events:read" | "registrations:review"
  | "departments:manage" | "cells:manage" | "programmes:manage" | "gathering_types:manage"
  | "analytics:view" | "reports:view" | "finance:view" | "finance:manage" | "users:manage" | "roles:manage" | "audit:view";

const M: Record<Role, Partial<Record<Permission, Scope>>> = {
  super_admin: {
    "members:create": "all", "members:read": "all", "members:update": "all", "members:delete": "all",
    "attendance:record": "all", "attendance:read": "all", "events:manage": "all", "events:read": "all",
    "registrations:review": "all", "departments:manage": "all", "cells:manage": "all",
    "programmes:manage": "all", "gathering_types:manage": "all", "analytics:view": "all",
    "reports:view": "all", "finance:view": "all", "finance:manage": "all",
    "users:manage": "all", "roles:manage": "all", "audit:view": "all",
  },
  church_admin: {
    "members:create": "all", "members:read": "all", "members:update": "all", "members:delete": "all",
    "attendance:record": "all", "attendance:read": "all", "events:manage": "all", "events:read": "all",
    "registrations:review": "all", "departments:manage": "all", "cells:manage": "all",
    "programmes:manage": "all", "gathering_types:manage": "all", "analytics:view": "all",
    "reports:view": "all", "finance:view": "all", "finance:manage": "all", "users:manage": "all",
  },
  department_leader: {
    "members:read": "department", "members:update": "department",
    "attendance:record": "department", "attendance:read": "department",
    "events:manage": "department", "events:read": "all",
    "analytics:view": "department", "reports:view": "department",
  },
  cell_leader: {
    "members:read": "cell", "attendance:record": "cell", "attendance:read": "cell",
    "events:read": "all", "analytics:view": "cell", "reports:view": "cell",
  },
};

export function can(role: Role, perm: Permission): Scope | false {
  return M[role]?.[perm] ?? false;
}
