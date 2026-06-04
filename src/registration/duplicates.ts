// Privacy-preserving duplicate detection. Computes advisory signals at submit
// time; never blocks the public submitter and never returns member PII.

export interface DuplicateResult {
  possibleDuplicate: boolean;
  duplicateOfMemberId: string | null;
  signals: string[];
}

export async function detectDuplicates(
  db: D1Database,
  input: { phone: string; fullName: string; dob: string | null },
): Promise<DuplicateResult> {
  const signals: string[] = [];
  let duplicateOfMemberId: string | null = null;

  // Exact phone match against live members
  const byPhone = await db
    .prepare("SELECT id FROM members WHERE phone_number = ? AND deleted_at IS NULL LIMIT 1")
    .bind(input.phone)
    .first<{ id: string }>();
  if (byPhone) {
    signals.push("phone_match_member");
    duplicateOfMemberId = byPhone.id;
  }

  // Name + DOB match against live members (full_name is a generated column)
  if (input.dob) {
    const byNameDob = await db
      .prepare(
        "SELECT id FROM members WHERE full_name = ? AND date_of_birth = ? AND deleted_at IS NULL LIMIT 1",
      )
      .bind(input.fullName, input.dob)
      .first<{ id: string }>();
    if (byNameDob) {
      signals.push("name_dob_match_member");
      duplicateOfMemberId = duplicateOfMemberId ?? byNameDob.id;
    }
  }

  // Phone already in a pending registration
  const byPending = await db
    .prepare("SELECT id FROM registrations WHERE phone_number = ? AND status = 'pending' LIMIT 1")
    .bind(input.phone)
    .first<{ id: string }>();
  if (byPending) signals.push("phone_match_pending");

  return { possibleDuplicate: signals.length > 0, duplicateOfMemberId, signals };
}
