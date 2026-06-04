// Human-readable member codes: PENSA-YYYY-NNNN, assigned atomically on approval.
export async function nextMemberCode(db: D1Database, year: string): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO member_code_counters (year, last_seq) VALUES (?, 1)
       ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1
       RETURNING last_seq`,
    )
    .bind(year)
    .first<{ last_seq: number }>();
  const seq = row?.last_seq ?? 1;
  return `PENSA-${year}-${String(seq).padStart(4, "0")}`;
}
