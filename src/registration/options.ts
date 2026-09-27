// Dropdown option data for the registration form (active, non-deleted lookups).

import type { CampusConfig } from "../config/campus";

export interface Option {
  id: string;
  name: string;
}
export interface PickupOption {
  id: string;
  name: string;
  departure_time: string | null;
}
export interface RegistrationOptions {
  programmes: Option[];
  departments: Option[];
  cells: Option[];
  gatheringTypes: Option[];
  hostels: Option[];
  pickupPoints: PickupOption[];
}

async function activeList(db: D1Database, table: string): Promise<Option[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name FROM ${table} WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name`,
    )
    .all<Option>();
  return results ?? [];
}

export async function getRegistrationOptions(db: D1Database, campus: CampusConfig): Promise<RegistrationOptions> {
  const [programmes, departments, cells, gatheringTypes] = await Promise.all([
    activeList(db, "programmes"),
    activeList(db, "departments"),
    activeList(db, "cells"),
    activeList(db, "gathering_types"),
  ]);

  // Campus-only tables — only query them where the feature is switched on, so
  // the shared code stays safe on databases that don't have these tables.
  const hostels = campus.features.hostelPicker ? await activeList(db, "hostels") : [];
  const pickupPoints: PickupOption[] = campus.features.pickupPoints
    ? ((await db
        .prepare("SELECT id, name, departure_time FROM pickup_points WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name")
        .all<PickupOption>()).results ?? [])
    : [];

  return { programmes, departments, cells, gatheringTypes, hostels, pickupPoints };
}
