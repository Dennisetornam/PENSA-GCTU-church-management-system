// Rotating refresh tokens with family-based reuse detection (raw D1).
import { randomToken, sha256Hex } from "./crypto";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
export class RefreshReuseError extends Error {}

interface RefreshRow {
  id: string;
  user_id: string;
  family_id: string;
  revoked_at: string | null;
  expires_at: string;
}

export async function issueRefreshToken(
  db: D1Database,
  opts: { userId: string; familyId?: string; parentId?: string; ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; id: string; familyId: string }> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const familyId = opts.familyId ?? crypto.randomUUID();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, parent_id, issued_at, expires_at, ip, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      opts.userId,
      familyId,
      tokenHash,
      opts.parentId ?? null,
      new Date(now).toISOString(),
      new Date(now + TTL_MS).toISOString(),
      opts.ip ?? null,
      opts.userAgent ?? null,
    )
    .run();
  return { token, id, familyId };
}

export async function revokeFamily(db: D1Database, familyId: string): Promise<void> {
  await db
    .prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), familyId)
    .run();
}

export async function rotateRefreshToken(
  db: D1Database,
  presented: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; userId: string; familyId: string }> {
  const hash = await sha256Hex(presented);
  const row = await db
    .prepare("SELECT id, user_id, family_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = ? LIMIT 1")
    .bind(hash)
    .first<RefreshRow>();
  if (!row) throw new RefreshReuseError("unknown token");
  if (row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) {
    await revokeFamily(db, row.family_id); // reuse/expired → nuke the family
    throw new RefreshReuseError("reuse detected");
  }
  const next = await issueRefreshToken(db, {
    userId: row.user_id,
    familyId: row.family_id,
    parentId: row.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  await db
    .prepare("UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?")
    .bind(new Date().toISOString(), next.id, row.id)
    .run();
  return { token: next.token, userId: row.user_id, familyId: row.family_id };
}

export async function revokeFamilyByToken(db: D1Database, presented: string): Promise<void> {
  const hash = await sha256Hex(presented);
  const row = await db
    .prepare("SELECT family_id FROM refresh_tokens WHERE token_hash = ? LIMIT 1")
    .bind(hash)
    .first<{ family_id: string }>();
  if (row) await revokeFamily(db, row.family_id);
}
