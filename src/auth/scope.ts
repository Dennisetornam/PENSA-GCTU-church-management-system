// Loads a user (with role name) and resolves their authorization scope:
// leaders get the department/cell ids they lead (via members.leader links).
import type { AccessScope } from "./jwt";
import type { Role } from "../rbac/permissions";

export interface UserWithRole {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role_id: string;
  role_name: string;
  status: string;
  member_id: string | null;
  failed_login_count: number;
  locked_until: string | null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserWithRole | null> {
  return db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.role_id, r.name AS role_name, u.status,
              u.member_id, u.failed_login_count, u.locked_until
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.email = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(email)
    .first<UserWithRole>();
}

export async function getUserById(db: D1Database, id: string): Promise<UserWithRole | null> {
  return db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.role_id, r.name AS role_name, u.status,
              u.member_id, u.failed_login_count, u.locked_until
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first<UserWithRole>();
}

export async function resolveScope(db: D1Database, user: UserWithRole): Promise<AccessScope> {
  const scope: AccessScope = { memberId: user.member_id ?? undefined, departments: [], cells: [] };
  if (user.role_name === "department_leader" && user.member_id) {
    const { results } = await db
      .prepare("SELECT id FROM departments WHERE leader_member_id = ? AND deleted_at IS NULL")
      .bind(user.member_id)
      .all<{ id: string }>();
    scope.departments = (results ?? []).map((r) => r.id);
  }
  if (user.role_name === "cell_leader" && user.member_id) {
    const { results } = await db
      .prepare("SELECT id FROM cells WHERE leader_member_id = ? AND deleted_at IS NULL")
      .bind(user.member_id)
      .all<{ id: string }>();
    scope.cells = (results ?? []).map((r) => r.id);
  }
  return scope;
}

export async function resolveScopeByUserId(
  db: D1Database,
  userId: string,
): Promise<{ role: Role; scope: AccessScope } | null> {
  const user = await getUserById(db, userId);
  if (!user) return null;
  return { role: user.role_name as Role, scope: await resolveScope(db, user) };
}
