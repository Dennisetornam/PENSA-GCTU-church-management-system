// D1 data access for registrations: draft upsert/get, image attach, and final
// submit (dedupe + reference + status=pending). Raw prepared statements keep the
// dependency surface minimal and consistent with the rest of the Worker.

import type { MemberData, DraftData } from "./schemas";
import { detectDuplicates } from "./duplicates";
import { nextRegistrationReference } from "./reference";

export function computeFullName(d: { firstName?: string; otherNames?: string; lastName?: string }): string {
  return [d.firstName, d.otherNames, d.lastName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

interface DraftRow {
  id: string;
  status: string;
  draft_token: string | null;
  profile_image_key: string | null;
  payload: string | null;
}

export async function getDraft(db: D1Database, token: string): Promise<DraftData | null> {
  const row = await db
    .prepare("SELECT payload FROM registrations WHERE draft_token = ? AND status = 'draft' LIMIT 1")
    .bind(token)
    .first<{ payload: string | null }>();
  if (!row) return null;
  return row.payload ? (JSON.parse(row.payload) as DraftData) : {};
}

async function findDraft(db: D1Database, token: string): Promise<DraftRow | null> {
  return db
    .prepare(
      "SELECT id, status, draft_token, profile_image_key, payload FROM registrations WHERE draft_token = ? AND status = 'draft' LIMIT 1",
    )
    .bind(token)
    .first<DraftRow>();
}

/** Create or update the draft row for this token. */
export async function upsertDraft(db: D1Database, token: string, data: DraftData): Promise<void> {
  const now = new Date().toISOString();
  const fullName = computeFullName(data) || null;
  const payload = JSON.stringify(data);
  const existing = await findDraft(db, token);
  if (existing) {
    await db
      .prepare(
        `UPDATE registrations SET payload = ?, full_name = ?, phone_number = ?, whatsapp_number = ?,
           date_of_birth = ?, profile_image_key = COALESCE(?, profile_image_key), updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        payload,
        fullName,
        data.phoneNumber ?? null,
        data.whatsappNumber ?? null,
        data.dateOfBirth ?? null,
        data.profileImageKey ?? null,
        now,
        existing.id,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO registrations
           (status, draft_token, payload, full_name, phone_number, whatsapp_number, date_of_birth, profile_image_key, created_at, updated_at)
         VALUES ('draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        token,
        payload,
        fullName,
        data.phoneNumber ?? null,
        data.whatsappNumber ?? null,
        data.dateOfBirth ?? null,
        data.profileImageKey ?? null,
        now,
        now,
      )
      .run();
  }
}

/** Attach an uploaded image key to the draft (creating the draft if needed). */
export async function attachDraftImage(db: D1Database, token: string, key: string): Promise<void> {
  const existing = await findDraft(db, token);
  const now = new Date().toISOString();
  if (existing) {
    await db
      .prepare("UPDATE registrations SET profile_image_key = ?, updated_at = ? WHERE id = ?")
      .bind(key, now, existing.id)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO registrations (status, draft_token, profile_image_key, payload, created_at, updated_at) VALUES ('draft', ?, ?, '{}', ?, ?)",
      )
      .bind(token, key, now, now)
      .run();
  }
}

export interface SubmitResult {
  id: string;
  reference: string;
  possibleDuplicate: boolean;
}

/** Finalize a registration: dedupe, assign reference, set status = pending. */
export async function submitRegistration(
  db: D1Database,
  data: MemberData,
  token: string | null,
  year: string,
): Promise<SubmitResult> {
  const fullName = computeFullName(data);
  const dup = await detectDuplicates(db, {
    phone: data.phoneNumber,
    fullName,
    dob: data.dateOfBirth,
  });
  const reference = await nextRegistrationReference(db, year);
  const now = new Date().toISOString();
  const payload = JSON.stringify(data);

  const existing = token ? await findDraft(db, token) : null;
  if (existing) {
    await db
      .prepare(
        `UPDATE registrations SET status = 'pending', reference = ?, draft_token = NULL, payload = ?,
           full_name = ?, phone_number = ?, whatsapp_number = ?, date_of_birth = ?, profile_image_key = ?,
           possible_duplicate = ?, duplicate_of_member_id = ?, duplicate_signals = ?, submitted_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        reference,
        payload,
        fullName,
        data.phoneNumber,
        data.whatsappNumber ?? null,
        data.dateOfBirth,
        data.profileImageKey,
        dup.possibleDuplicate ? 1 : 0,
        dup.duplicateOfMemberId,
        JSON.stringify(dup.signals),
        now,
        now,
        existing.id,
      )
      .run();
    return { id: existing.id, reference, possibleDuplicate: dup.possibleDuplicate };
  }

  const inserted = await db
    .prepare(
      `INSERT INTO registrations
         (status, reference, payload, full_name, phone_number, whatsapp_number, date_of_birth, profile_image_key,
          possible_duplicate, duplicate_of_member_id, duplicate_signals, submitted_at, created_at, updated_at)
       VALUES ('pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      reference,
      payload,
      fullName,
      data.phoneNumber,
      data.whatsappNumber ?? null,
      data.dateOfBirth,
      data.profileImageKey,
      dup.possibleDuplicate ? 1 : 0,
      dup.duplicateOfMemberId,
      JSON.stringify(dup.signals),
      now,
      now,
      now,
    )
    .first<{ id: string }>();
  return { id: inserted!.id, reference, possibleDuplicate: dup.possibleDuplicate };
}
