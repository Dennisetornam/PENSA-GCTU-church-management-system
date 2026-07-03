// Approval / rejection of pending registrations.
// Approve = create a permanent member record (PENSA code), link departments,
// record the lifecycle, promote the draft image in R2, and close the registration.

import type { Env } from "../types";
import type { MemberData } from "./schemas";
import { nextMemberCode } from "../members/codes";
import { thumbKeyOf } from "../media/image";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const bit = (b: unknown) => (b ? 1 : 0);
const nz = (s: unknown) => (s && String(s).length > 0 ? String(s) : null);

export interface ApproveResult {
  memberId: string;
  memberCode: string;
  membershipStatus: string;
}

export async function approveRegistration(
  env: Env,
  registrationId: string,
  opts: { membershipStatus?: string; reviewedBy?: string | null },
): Promise<ApproveResult> {
  const db = env.DB;
  const reg = await db
    .prepare("SELECT * FROM registrations WHERE id = ? LIMIT 1")
    .bind(registrationId)
    .first<Record<string, unknown>>();
  if (!reg) throw new NotFoundError("registration not found");
  if (reg.status !== "pending") throw new ConflictError(`registration is ${reg.status}`);

  const data = (reg.payload ? JSON.parse(reg.payload as string) : {}) as Partial<MemberData>;
  const now = new Date().toISOString();
  const year = new Date().getUTCFullYear().toString();
  const memberCode = await nextMemberCode(db, year);
  const memberId = crypto.randomUUID();
  const status = opts.membershipStatus ?? data.membershipStatus ?? "visitor";
  const reviewedBy = opts.reviewedBy ?? null;

  // Promote the draft image (R2 copy = get + put), if present.
  let profileKey: string | null = null;
  const draftKey = reg.profile_image_key as string | null;
  if (draftKey) {
    const src = await env.MEDIA!.get(draftKey);
    if (src) {
      const ext = draftKey.split(".").pop() ?? "jpg";
      profileKey = `members/${memberId}/avatar.${ext}`;
      await env.MEDIA!.put(profileKey, src.body, { httpMetadata: src.httpMetadata });
      // Promote the thumbnail too, if the draft had one.
      const draftThumb = await env.MEDIA!.get(thumbKeyOf(draftKey));
      if (draftThumb) {
        await env.MEDIA!.put(thumbKeyOf(profileKey), draftThumb.body, { httpMetadata: draftThumb.httpMetadata });
      }
    }
  }

  await db
    .prepare(
      `INSERT INTO members
        (id, first_name, last_name, other_names, date_of_birth, programme_id, level, residence_status,
         residence_detail, residence_during_vacation, cell_id, primary_gathering_type_id, holy_ghost_baptism,
         holy_ghost_baptism_date, water_baptism, water_baptism_date, phone_number, whatsapp_number,
         membership_status, registration_status, member_code, profile_picture_key, approved_by,
         approved_at, join_date, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'approved', ?,?,?,?,?,?,?)`,
    )
    .bind(
      memberId,
      data.firstName ?? "",
      data.lastName ?? "",
      nz(data.otherNames),
      nz(data.dateOfBirth),
      nz(data.programmeId),
      nz(data.level),
      nz(data.residenceStatus),
      nz(data.residenceDetail),
      nz(data.vacationResidence),
      nz(data.cellId),
      nz(data.primaryGatheringTypeId),
      bit(data.holyGhostBaptism),
      nz(data.holyGhostBaptismDate),
      bit(data.waterBaptism),
      nz(data.waterBaptismDate),
      data.phoneNumber ?? "",
      nz(data.whatsappNumber),
      status,
      memberCode,
      profileKey,
      reviewedBy,
      now,
      now.slice(0, 10),
      now,
      now,
    )
    .run();

  // Departments (M:N)
  for (const deptId of data.departmentIds ?? []) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO member_departments (id, member_id, department_id, role_in_department, joined_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, 'member', ?)`,
      )
      .bind(memberId, deptId, now)
      .run();
  }

  // Lifecycle history (none -> status)
  await db
    .prepare(
      `INSERT INTO membership_history (id, member_id, from_status, to_status, reason, changed_by, created_at)
       VALUES (lower(hex(randomblob(16))), ?, NULL, ?, 'approved from registration', ?, ?)`,
    )
    .bind(memberId, status, reviewedBy, now)
    .run();

  // Close the registration
  await db
    .prepare(
      "UPDATE registrations SET status='approved', reviewed_by=?, reviewed_at=?, member_id=?, updated_at=? WHERE id=?",
    )
    .bind(reviewedBy, now, memberId, now, registrationId)
    .run();

  await db
    .prepare(
      `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, summary, created_at)
       VALUES (lower(hex(randomblob(16))), ?, 'registration.approved', 'member', ?, ?, datetime('now'))`,
    )
    .bind(reviewedBy, memberId, `member_code=${memberCode} status=${status}`)
    .run();

  return { memberId, memberCode, membershipStatus: status };
}

export async function rejectRegistration(
  env: Env,
  registrationId: string,
  reason: string,
  reviewedBy: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "UPDATE registrations SET status='rejected', rejection_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=? AND status='pending'",
  )
    .bind(reason, reviewedBy, now, now, registrationId)
    .run();
  if (!res.meta.changes) throw new ConflictError("registration not pending or not found");
  await env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, summary, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'registration.rejected', 'registration', ?, ?, datetime('now'))`,
  )
    .bind(reviewedBy, registrationId, `reason=${reason}`)
    .run();
}
