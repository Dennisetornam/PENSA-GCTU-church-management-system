// Dropdown option data for the registration form (active, non-deleted lookups).

export interface Option {
  id: string;
  name: string;
}
export interface RegistrationOptions {
  programmes: Option[];
  departments: Option[];
  cells: Option[];
  gatheringTypes: Option[];
}

async function activeList(db: D1Database, table: string): Promise<Option[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name FROM ${table} WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name`,
    )
    .all<Option>();
  return results ?? [];
}

export async function getRegistrationOptions(db: D1Database): Promise<RegistrationOptions> {
  const [programmes, departments, cells, gatheringTypes] = await Promise.all([
    activeList(db, "programmes"),
    activeList(db, "departments"),
    activeList(db, "cells"),
    activeList(db, "gathering_types"),
  ]);
  return { programmes, departments, cells, gatheringTypes };
}
