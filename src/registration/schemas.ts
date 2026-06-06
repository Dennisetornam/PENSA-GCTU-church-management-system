// Zod schemas for the registration module. Server-authoritative; the client
// imports the same shapes so validation cannot drift.
import { z } from "zod";

/** Normalize a Ghana phone number toward E.164 (+233XXXXXXXXX). */
export function normalizeGhanaPhone(raw: string): string {
  const s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("+233")) return s;
  if (s.startsWith("233")) return "+" + s;
  if (s.startsWith("0")) return "+233" + s.slice(1);
  if (s.startsWith("+")) return s;
  return "+233" + s;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const optionalIsoDate = z.union([isoDate, z.literal("")]).optional();

const phone = z
  .string()
  .refine((v) => v.replace(/\D/g, "").length === 10, { message: "phone number must be 10 digits" })
  .transform(normalizeGhanaPhone)
  .refine((v) => /^\+\d{8,15}$/.test(v), { message: "invalid phone number" });

const optionalPhone = z.union([phone, z.literal("")]).optional();

/** The full member data captured by the wizard (all required at submit). */
export const memberDataSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  otherNames: z.string().trim().max(60).optional().or(z.literal("")),
  dateOfBirth: isoDate,
  programmeId: z.string().min(1),
  level: z.string().min(1),
  residenceStatus: z.enum(["hostel_resident", "non_resident"]),
  residenceDetail: z.string().trim().min(2).max(200),
  vacationResidence: z.string().trim().min(2).max(200),
  departmentIds: z.array(z.string().min(1)).min(1, "select at least one department"),
  cellId: z.string().min(1),
  holyGhostBaptism: z.boolean(),
  holyGhostBaptismDate: optionalIsoDate,
  waterBaptism: z.boolean(),
  waterBaptismDate: optionalIsoDate,
  phoneNumber: phone,
  whatsappNumber: optionalPhone,
  membershipStatus: z.enum(["actual_member", "visitor", "associate", "alumni"]),
  // Gathering type is chosen by the admin at check-in, not at registration.
  primaryGatheringTypeId: z.string().optional(),
  profileImageKey: z.string().min(1, "profile picture is required"),
});

export type MemberData = z.infer<typeof memberDataSchema>;

/** Draft saves accept any partial subset (photo not yet required). */
export const draftSchema = memberDataSchema.partial();
export type DraftData = z.infer<typeof draftSchema>;

/** Final submit = full data + Turnstile (+ optional draft token via cookie). */
export const submitSchema = memberDataSchema.extend({
  turnstileToken: z.string().min(1, "verification required"),
});
export type SubmitData = z.infer<typeof submitSchema>;
