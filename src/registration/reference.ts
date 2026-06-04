// Generates human-readable registration references: REG-YYYY-NNNN.
// Uses an atomic per-year counter (single UPSERT … RETURNING) so concurrent
// submissions never collide.

export async function nextRegistrationReference(db: D1Database, year: string): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO registration_ref_counters (year, last_seq) VALUES (?, 1)
       ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1
       RETURNING last_seq`,
    )
    .bind(year)
    .first<{ last_seq: number }>();
  const seq = row?.last_seq ?? 1;
  return `REG-${year}-${String(seq).padStart(4, "0")}`;
}
