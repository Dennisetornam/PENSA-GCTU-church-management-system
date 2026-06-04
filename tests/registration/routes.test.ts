import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { registrationRoutes } from "../../src/registration/routes";
import { makeTestEnv, type TestEnv } from "../helpers/env";

const ORIGIN = "https://pensa.gctu";

function makeApp() {
  const app = new Hono();
  app.route("/register", registrationRoutes as never);
  return app;
}

function getCookie(res: Response, name: string): string | null {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  for (const c of h.getSetCookie?.() ?? []) if (c.startsWith(name + "=")) return c.slice(name.length + 1).split(";")[0]!;
  return null;
}

const validBody = (imageKey: string) => ({
  firstName: "Yaw", lastName: "Owusu", otherNames: "",
  dateOfBirth: "2002-03-15", programmeId: "prog_focis_bsc_cs",
  residenceStatus: "hostel_resident", vacationResidence: "Kumasi",
  departmentIds: ["dept_media"], cellId: "cell_moriah",
  holyGhostBaptism: true, holyGhostBaptismDate: "", waterBaptism: false, waterBaptismDate: "",
  phoneNumber: "0209998877", whatsappNumber: "", membershipStatus: "visitor",
  primaryGatheringTypeId: "gt_sunday", profileImageKey: imageKey, turnstileToken: "dummy",
});

let env: TestEnv;
let app: Hono;
beforeEach(() => {
  env = makeTestEnv({ seed: true });
  app = makeApp();
});
afterEach(() => vi.restoreAllMocks());

describe("Module 3 — registration routes", () => {
  it("GET /register/options returns the seeded lookups", async () => {
    const res = await app.fetch(new Request(`${ORIGIN}/register/options`), env as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { programmes: unknown[]; departments: unknown[]; cells: unknown[]; gatheringTypes: unknown[] };
    expect(body.programmes.length).toBe(39);
    expect(body.cells.length).toBe(3);
    expect(body.gatheringTypes.length).toBe(5);
  });

  it("saves a draft and resumes it via the cookie", async () => {
    const save = await app.fetch(
      new Request(`${ORIGIN}/register/draft`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ firstName: "Yaw", phoneNumber: "0209998877" }),
      }),
      env as never,
    );
    expect(save.status).toBe(200);
    const token = getCookie(save, "pensa_reg_draft");
    expect(token).toBeTruthy();
    const resume = await app.fetch(
      new Request(`${ORIGIN}/register/draft`, { headers: { cookie: `pensa_reg_draft=${token}` } }),
      env as never,
    );
    const body = (await resume.json()) as { draft: { firstName: string } | null };
    expect(body.draft?.firstName).toBe("Yaw");
  });

  it("uploads a PNG image to R2 (magic-byte validated)", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "photo.png");
    const res = await app.fetch(new Request(`${ORIGIN}/register/image`, { method: "POST", headers: { origin: ORIGIN }, body: form }), env as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string };
    expect(body.key.startsWith("registrations/drafts/")).toBe(true);
    expect(env.__r2.has(body.key)).toBe(true);
  });

  it("rejects a non-image upload", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }), "fake.png");
    const res = await app.fetch(new Request(`${ORIGIN}/register/image`, { method: "POST", headers: { origin: ORIGIN }, body: form }), env as never);
    expect(res.status).toBe(415);
  });

  it("submits a full registration as pending (Turnstile verified)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const res = await app.fetch(
      new Request(`${ORIGIN}/register`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify(validBody("registrations/drafts/x/y.png")),
      }),
      env as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reference: string; status: string };
    expect(body.reference).toBe("REG-2026-0001");
    expect(body.status).toBe("pending_approval");
  });

  it("returns 400 on invalid submission (missing photo)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const bad = validBody("");
    bad.profileImageKey = "";
    const res = await app.fetch(
      new Request(`${ORIGIN}/register`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(bad) }),
      env as never,
    );
    expect(res.status).toBe(400);
  });

  it("rejects submission when Turnstile fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    const res = await app.fetch(
      new Request(`${ORIGIN}/register`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(validBody("registrations/drafts/x/y.png")) }),
      env as never,
    );
    expect(res.status).toBe(400);
  });
});
