import { describe, it, expect, beforeEach } from "vitest";
import { approveRegistration, rejectRegistration, NotFoundError, ConflictError } from "../../src/registration/approval";
import { submitRegistration } from "../../src/registration/repository";
import { memberDataSchema } from "../../src/registration/schemas";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const member = memberDataSchema.parse({
  firstName: "Yaw", lastName: "Owusu", otherNames: "",
  dateOfBirth: "2002-03-15", programmeId: "prog_focis_bsc_cs",
  residenceStatus: "hostel_resident", residenceDetail: "Hall 7", vacationResidence: "Kumasi",
  departmentIds: ["dept_media", "dept_music_drama"], cellId: "cell_moriah",
  holyGhostBaptism: true, holyGhostBaptismDate: "", waterBaptism: false, waterBaptismDate: "",
  phoneNumber: "0209998877", whatsappNumber: "0209998877", membershipStatus: "visitor",
  primaryGatheringTypeId: "gt_sunday", profileImageKey: "registrations/drafts/t/photo.png",
});

let env: TestEnv;
beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u-admin','Admin','a@x','h','role_church_admin')").run();
  // place the draft image so promotion runs
  await env.MEDIA.put("registrations/drafts/t/photo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { httpMetadata: { contentType: "image/png" } });
});

async function createPending() {
  const res = await submitRegistration(env.DB as never, member, null, "2026");
  return res.id;
}

describe("Module 4 — approval", () => {
  it("approves a registration into a member with a PENSA code, departments, history, and promoted image", async () => {
    const regId = await createPending();
    const result = await approveRegistration(env as never, regId, { membershipStatus: "visitor", reviewedBy: "u-admin" });
    expect(result.memberCode).toBe("PENSA-2026-0001");

    const member = env.DB.__raw.prepare("SELECT * FROM members WHERE id = ?").get(result.memberId) as Record<string, unknown>;
    expect(member.member_code).toBe("PENSA-2026-0001");
    expect(member.registration_status).toBe("approved");
    expect(member.cell_id).toBe("cell_moriah");
    expect(member.profile_picture_key).toBe(`members/${result.memberId}/avatar.png`);
    expect(env.__r2.has(`members/${result.memberId}/avatar.png`)).toBe(true);

    const depts = env.DB.__raw.prepare("SELECT count(*) c FROM member_departments WHERE member_id = ?").get(result.memberId) as { c: number };
    expect(depts.c).toBe(2);

    const hist = env.DB.__raw.prepare("SELECT to_status FROM membership_history WHERE member_id = ?").get(result.memberId) as { to_status: string };
    expect(hist.to_status).toBe("visitor");

    const reg = env.DB.__raw.prepare("SELECT status, member_id FROM registrations WHERE id = ?").get(regId) as { status: string; member_id: string };
    expect(reg.status).toBe("approved");
    expect(reg.member_id).toBe(result.memberId);
  });

  it("rejects a registration with a reason", async () => {
    const regId = await createPending();
    await rejectRegistration(env as never, regId, "incomplete info", "u-admin");
    const reg = env.DB.__raw.prepare("SELECT status, rejection_reason FROM registrations WHERE id = ?").get(regId) as { status: string; rejection_reason: string };
    expect(reg.status).toBe("rejected");
    expect(reg.rejection_reason).toBe("incomplete info");
  });

  it("cannot approve a non-pending registration", async () => {
    const regId = await createPending();
    await approveRegistration(env as never, regId, { reviewedBy: "u-admin" });
    await expect(approveRegistration(env as never, regId, { reviewedBy: "u-admin" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws NotFound for an unknown registration", async () => {
    await expect(approveRegistration(env as never, "nope", { reviewedBy: "u-admin" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assigns sequential PENSA codes across approvals", async () => {
    const r1 = await createPending();
    const a1 = await approveRegistration(env as never, r1, { reviewedBy: "u-admin" });
    // second registration with a different phone
    const m2 = { ...member, phoneNumber: "+233200000123" };
    const r2 = await submitRegistration(env.DB as never, m2, null, "2026");
    const a2 = await approveRegistration(env as never, r2.id, { reviewedBy: "u-admin" });
    expect(a1.memberCode).toBe("PENSA-2026-0001");
    expect(a2.memberCode).toBe("PENSA-2026-0002");
  });
});
