import { describe, it, expect, beforeEach } from "vitest";
import { memberDataSchema, draftSchema, submitSchema, normalizeGhanaPhone } from "../../src/registration/schemas";
import { nextRegistrationReference } from "../../src/registration/reference";
import { detectDuplicates } from "../../src/registration/duplicates";
import { upsertDraft, getDraft, submitRegistration, computeFullName } from "../../src/registration/repository";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const validMember = {
  firstName: "Ama",
  lastName: "Boateng",
  otherNames: "",
  dateOfBirth: "2003-05-10",
  programmeId: "prog_focis_bsc_se",
  residenceStatus: "non_resident" as const,
  residenceDetail: "Hall 7", vacationResidence: "East Legon",
  departmentIds: ["dept_media", "dept_prayer"],
  cellId: "cell_dunamis",
  holyGhostBaptism: true,
  holyGhostBaptismDate: "",
  waterBaptism: false,
  waterBaptismDate: "",
  phoneNumber: "0241234567",
  whatsappNumber: "0241234567",
  membershipStatus: "visitor" as const,
  primaryGatheringTypeId: "gt_sunday",
  profileImageKey: "registrations/drafts/t/p.png",
};

describe("Module 3 — schemas", () => {
  it("normalizes Ghana phone numbers to E.164", () => {
    expect(normalizeGhanaPhone("0241234567")).toBe("+233241234567");
    expect(normalizeGhanaPhone("233241234567")).toBe("+233241234567");
    expect(normalizeGhanaPhone("+233241234567")).toBe("+233241234567");
  });
  it("accepts a full valid submission and normalizes phone", () => {
    const parsed = memberDataSchema.parse(validMember);
    expect(parsed.phoneNumber).toBe("+233241234567");
  });
  it("requires a profile image", () => {
    const { profileImageKey, ...noPhoto } = validMember;
    void profileImageKey;
    expect(memberDataSchema.safeParse(noPhoto).success).toBe(false);
  });
  it("requires at least one department", () => {
    expect(memberDataSchema.safeParse({ ...validMember, departmentIds: [] }).success).toBe(false);
  });
  it("draft accepts partial data; submit requires turnstile", () => {
    expect(draftSchema.safeParse({ firstName: "Ama" }).success).toBe(true);
    expect(submitSchema.safeParse(validMember).success).toBe(false); // missing turnstileToken
    expect(submitSchema.safeParse({ ...validMember, turnstileToken: "t" }).success).toBe(true);
  });
});

describe("Module 3 — reference counter", () => {
  it("produces sequential REG-YYYY-NNNN", async () => {
    const env = makeTestEnv();
    expect(await nextRegistrationReference(env.DB as never, "2026")).toBe("REG-2026-0001");
    expect(await nextRegistrationReference(env.DB as never, "2026")).toBe("REG-2026-0002");
  });
});

describe("Module 3 — duplicate detection", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestEnv({ seed: true });
  });
  it("flags an exact phone match against a live member", async () => {
    await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number) VALUES ('m1','Ama','Boateng','+233241234567')").run();
    const r = await detectDuplicates(env.DB as never, { phone: "+233241234567", fullName: "X Y", dob: null });
    expect(r.possibleDuplicate).toBe(true);
    expect(r.signals).toContain("phone_match_member");
    expect(r.duplicateOfMemberId).toBe("m1");
  });
  it("flags a name+dob match", async () => {
    await env.DB.prepare("INSERT INTO members (id, first_name, last_name, date_of_birth, phone_number) VALUES ('m1','Ama','Boateng','2003-05-10','+233200000000')").run();
    const r = await detectDuplicates(env.DB as never, { phone: "+233299999999", fullName: "Ama Boateng", dob: "2003-05-10" });
    expect(r.signals).toContain("name_dob_match_member");
  });
  it("returns no duplicate for a fresh person", async () => {
    const r = await detectDuplicates(env.DB as never, { phone: "+233288888888", fullName: "New Person", dob: "2001-01-01" });
    expect(r.possibleDuplicate).toBe(false);
  });
});

describe("Module 3 — repository", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestEnv({ seed: true });
  });
  it("computes full name including other names", () => {
    expect(computeFullName({ firstName: "Kwame", otherNames: "Kofi", lastName: "Mensah" })).toBe("Kwame Kofi Mensah");
  });
  it("upserts and resumes a draft by token", async () => {
    await upsertDraft(env.DB as never, "tok-1", { firstName: "Ama", phoneNumber: "+233241234567" });
    let draft = await getDraft(env.DB as never, "tok-1");
    expect(draft?.firstName).toBe("Ama");
    await upsertDraft(env.DB as never, "tok-1", { firstName: "Ama", lastName: "Boateng", phoneNumber: "+233241234567" });
    draft = await getDraft(env.DB as never, "tok-1");
    expect(draft?.lastName).toBe("Boateng");
    // still a single draft row
    const count = (env.DB.__raw.prepare("SELECT count(*) c FROM registrations WHERE status='draft'").get() as { c: number }).c;
    expect(count).toBe(1);
  });
  it("submits a registration as pending with a reference", async () => {
    const data = memberDataSchema.parse(validMember);
    const res = await submitRegistration(env.DB as never, data, null, "2026");
    expect(res.reference).toBe("REG-2026-0001");
    const row = env.DB.__raw
      .prepare("SELECT status, full_name, phone_number, possible_duplicate FROM registrations WHERE id = ?")
      .get(res.id) as { status: string; full_name: string; phone_number: string; possible_duplicate: number };
    expect(row.status).toBe("pending");
    expect(row.full_name).toBe("Ama Boateng");
    expect(row.phone_number).toBe("+233241234567");
  });
  it("flags a second submission with the same phone as a possible duplicate", async () => {
    const data = memberDataSchema.parse(validMember);
    await submitRegistration(env.DB as never, data, null, "2026");
    const res2 = await submitRegistration(env.DB as never, data, null, "2026");
    expect(res2.possibleDuplicate).toBe(true);
  });
});
