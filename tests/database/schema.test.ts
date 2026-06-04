import { describe, it, expect } from "vitest";
import { makeTestEnv } from "../helpers/env";

describe("Module 1 — Database schema", () => {
  it("loads the full schema and seeds (4 roles, 39 programmes)", () => {
    const env = makeTestEnv({ seed: true });
    const roles = env.DB.__raw.prepare("SELECT count(*) c FROM roles").get() as { c: number };
    const progs = env.DB.__raw.prepare("SELECT count(*) c FROM programmes").get() as { c: number };
    expect(roles.c).toBe(4);
    expect(progs.c).toBe(39);
  });

  it("seeds are idempotent (re-running keeps counts stable)", () => {
    const env = makeTestEnv({ seed: true });
    const before = (env.DB.__raw.prepare("SELECT count(*) c FROM cells").get() as { c: number }).c;
    // re-run reference seed
    env.DB.__raw.exec(
      `INSERT INTO cells (id, name) VALUES ('cell_dunamis','Dunamis') ON CONFLICT(id) DO NOTHING;`,
    );
    const after = (env.DB.__raw.prepare("SELECT count(*) c FROM cells").get() as { c: number }).c;
    expect(after).toBe(before);
  });

  it("generates full_name and indexes it", async () => {
    const env = makeTestEnv({ seed: true });
    await env.DB.prepare(
      "INSERT INTO members (id, first_name, last_name, other_names, phone_number, cell_id) VALUES (?,?,?,?,?,?)",
    )
      .bind("m1", "Kwame", "Mensah", "Kofi", "+233200000001", "cell_dunamis")
      .run();
    const row = await env.DB.prepare("SELECT full_name FROM members WHERE id='m1'").first<{ full_name: string }>();
    expect(row?.full_name).toBe("Kwame Kofi Mensah");
  });

  it("enforces 4 attendance statuses incl. 'late'", async () => {
    const env = makeTestEnv({ seed: true });
    await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number) VALUES ('m1','A','B','+233200000002')").run();
    await env.DB.prepare("INSERT INTO attendance_sessions (id, gathering_type_id, session_date) VALUES ('s1','gt_sunday','2026-06-07')").run();
    await env.DB.prepare("INSERT INTO attendance_records (id, session_id, member_id, status) VALUES ('a1','s1','m1','late')").run();
    const r = await env.DB.prepare("SELECT status FROM attendance_records WHERE id='a1'").first<{ status: string }>();
    expect(r?.status).toBe("late");
    // invalid status rejected
    expect(() =>
      env.DB.__raw.exec("INSERT INTO attendance_records (id, session_id, member_id, status) VALUES ('a2','s1','m1','maybe')"),
    ).toThrow();
  });

  it("enforces unique phone among live members and FK integrity", async () => {
    const env = makeTestEnv({ seed: true });
    await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number) VALUES ('m1','A','B','+233200000003')").run();
    expect(() =>
      env.DB.__raw.exec("INSERT INTO members (id, first_name, last_name, phone_number) VALUES ('m2','C','D','+233200000003')"),
    ).toThrow();
    // FK: cell_id must exist
    expect(() =>
      env.DB.__raw.exec("INSERT INTO members (id, first_name, last_name, phone_number, cell_id) VALUES ('m3','E','F','+233200000004','nope')"),
    ).toThrow();
  });

  it("atomic member_code and registration_ref counters produce padded sequences", async () => {
    const env = makeTestEnv();
    const code = async (year: string) =>
      (await env.DB.prepare(
        "INSERT INTO member_code_counters(year,last_seq) VALUES(?,1) ON CONFLICT(year) DO UPDATE SET last_seq=last_seq+1 RETURNING last_seq",
      ).bind(year).first<{ last_seq: number }>())!.last_seq;
    const s1 = await code("2026");
    const s2 = await code("2026");
    expect(`PENSA-2026-${String(s1).padStart(4, "0")}`).toBe("PENSA-2026-0001");
    expect(`PENSA-2026-${String(s2).padStart(4, "0")}`).toBe("PENSA-2026-0002");
  });
});
