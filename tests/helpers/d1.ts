// A minimal D1Database-compatible shim backed by node:sqlite, for tests.
// Implements the subset our code uses: prepare().bind().first()/all()/run(),
// exec(), and batch(). D1 is SQLite, so behavior (RETURNING, generated columns,
// partial indexes, FKs, triggers) matches the production engine.
//
// node:sqlite is loaded via createRequire so Vite's bundler does not try to
// resolve it (its builtin list predates node:sqlite).
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { DatabaseSync } = nodeRequire("node:sqlite") as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawStmt = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawDb = any;

class TestStmt {
  constructor(private readonly stmt: RawStmt, private readonly args: unknown[] = []) {}
  bind(...args: unknown[]): TestStmt {
    return new TestStmt(this.stmt, args);
  }
  async first<T = unknown>(): Promise<T | null> {
    const row = this.stmt.get(...this.args);
    return (row ?? null) as T | null;
  }
  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: this.stmt.all(...this.args) as T[] };
  }
  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const r = this.stmt.run(...this.args);
    return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export interface TestDb {
  prepare(sql: string): TestStmt;
  exec(sql: string): Promise<unknown>;
  batch(stmts: TestStmt[]): Promise<unknown[]>;
  __raw: RawDb;
}

export function createTestDb(): TestDb {
  const db: RawDb = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return {
    __raw: db,
    prepare(sql: string) {
      return new TestStmt(db.prepare(sql));
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    async batch(stmts: TestStmt[]) {
      const out: unknown[] = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}
