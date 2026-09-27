// Campus configuration. Each church runs as its OWN deployment (own DB/R2/KV)
// with the CAMPUS worker var set. This drives branding + which optional
// features are switched on. GCTU is the default and has every optional feature
// OFF, so its behaviour is unchanged; KNUST turns them on.
//
// IMPORTANT: any query that touches a campus-only table (pickup_points,
// hostels, help_desk_tickets) MUST be guarded by the matching feature flag, so
// the shared code stays safe on a database that doesn't have those tables.

export type CampusId = "gctu" | "knust";

export interface CampusFeatures {
  /** Registration collects a bus pick-up point + admins see riders per point. */
  pickupPoints: boolean;
  /** PENSA Discipleship Program section (currently a "coming soon" placeholder). */
  pdp: boolean;
  /** Public Help Desk intake + admin inbox. */
  helpDesk: boolean;
  /** Registration lets a student opt out of joining a department. */
  noDepartmentOption: boolean;
  /** Registration picks the hostel from a managed list instead of free text. */
  hostelPicker: boolean;
  /** This campus runs cells (small groups). When off, cells are hidden and not required. */
  cells: boolean;
}

export interface CampusConfig {
  id: CampusId;
  name: string;
  shortName: string;
  features: CampusFeatures;
}

// The optional KNUST features, all off. `cells` is handled per-campus below
// because GCTU runs cells (true) while KNUST does not (false).
const ALL_OFF = {
  pickupPoints: false,
  pdp: false,
  helpDesk: false,
  noDepartmentOption: false,
  hostelPicker: false,
} as const;

const CONFIGS: Record<CampusId, CampusConfig> = {
  gctu: {
    id: "gctu",
    name: "PENSA GCTU",
    shortName: "GCTU",
    features: { ...ALL_OFF, cells: true },
  },
  knust: {
    id: "knust",
    name: "PENSA KNUST – Obuasi Campus",
    shortName: "KNUST Obuasi",
    features: {
      pickupPoints: true,
      pdp: true,
      helpDesk: true,
      noDepartmentOption: true,
      hostelPicker: true,
      cells: false,
    },
  },
};

/** Resolve the campus config from the worker env (defaults to GCTU). */
export function campusConfig(env: { CAMPUS?: string }): CampusConfig {
  const id: CampusId = env.CAMPUS === "knust" ? "knust" : "gctu";
  return CONFIGS[id];
}
