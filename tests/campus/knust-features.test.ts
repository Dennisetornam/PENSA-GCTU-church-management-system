import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { adminRoutes } from "../../src/admin/routes";
import { helpDeskRoutes } from "../../src/helpdesk/routes";
import { registrationRoutes } from "../../src/registration/routes";
import { signAccessToken } from "../../src/auth/jwt";
import { makeTestEnv, type TestEnv } from "../helpers/env";

let env: TestEnv;
let app: Hono;
let token: string;

beforeEach(async () => {
  env = makeTestEnv({ seed: true });
  env.CAMPUS = "knust"; // turn KNUST features on for this suite
  app = new Hono();
  app.route("/api", adminRoutes as never);
  app.route("/help-desk", helpDeskRoutes as never);
  app.route("/register", registrationRoutes as never);
  token = await signAccessToken({ sub: "u", role: "super_admin", scope: { departments: [], cells: [] } }, env.JWT_SECRET);
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role_id) VALUES ('u','Admin','a@x.test','x','role_super_admin')").run();
  await env.DB.prepare("INSERT INTO pickup_points (id, name, departure_time) VALUES ('pp1','Campus Zone','06:30'),('pp2','Lemez Zone','06:30')").run();
  await env.DB.prepare("INSERT INTO hostels (id, name) VALUES ('h1','Lemez Hostel'),('h2','SAL Hostel')").run();
  await env.DB.prepare("INSERT INTO members (id, first_name, last_name, phone_number, registration_status, pickup_point_id) VALUES ('m1','Kofi','Mensah','+233200000001','approved','pp1'),('m2','Ama','Owusu','+233200000002','approved','pp1'),('m3','Yaw','Boateng','+233200000003','approved',NULL)").run();
});

const auth = (init: RequestInit = {}) => ({ authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) });
const req = (path: string, init: RequestInit = {}) => app.fetch(new Request(`https://x${path}`, { ...init, headers: auth(init) }), env as never);
const pub = (path: string, init: RequestInit = {}) => app.fetch(new Request(`https://x${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } }), env as never);

describe("KNUST campus features", () => {
  it("exposes campus config + hostels + pick-up points in registration options", async () => {
    const o = await (await pub("/register/options")).json() as { campus: { id: string; features: Record<string, boolean> }; hostels: unknown[]; pickupPoints: unknown[] };
    expect(o.campus.id).toBe("knust");
    expect(o.campus.features.pickupPoints).toBe(true);
    expect(o.hostels.length).toBe(2);
    expect(o.pickupPoints.length).toBe(2);
  });

  it("lists pick-up points with rider counts and the riders of a zone", async () => {
    const list = await (await req("/api/pickup-points")).json() as { results: { id: string; rider_count: number }[] };
    const campus = list.results.find((p) => p.id === "pp1")!;
    expect(campus.rider_count).toBe(2);
    const riders = await (await req("/api/pickup-points/pp1/members")).json() as { results: { id: string }[] };
    expect(riders.results.map((r) => r.id).sort()).toEqual(["m1", "m2"]);
  });

  it("accepts a public help-desk message (incl. anonymous) and lets admins triage it", async () => {
    const submit = await pub("/help-desk/submit", { method: "POST", body: JSON.stringify({ category: "concern", message: "Something is bothering me.", isAnonymous: true, name: "ignored" }) });
    expect(submit.status).toBe(201);
    const { reference } = await submit.json() as { reference: string };
    expect(reference).toMatch(/^HD-/);

    const inbox = await (await req("/api/help-desk?status=open")).json() as { results: { id: string; is_anonymous: number; name: string | null }[]; byStatus: Record<string, number> };
    expect(inbox.results.length).toBe(1);
    expect(inbox.results[0]!.is_anonymous).toBe(1);
    expect(inbox.results[0]!.name).toBeNull(); // anonymity strips the name
    expect(inbox.byStatus.open).toBe(1);

    const id = inbox.results[0]!.id;
    expect((await req(`/api/help-desk/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved", adminNotes: "called back" }) })).status).toBe(200);
    const resolved = await (await req("/api/help-desk?status=resolved")).json() as { results: { admin_notes: string }[] };
    expect(resolved.results[0]?.admin_notes).toBe("called back");
  });
});

describe("GCTU campus (features off)", () => {
  beforeEach(() => { env.CAMPUS = "gctu"; });

  it("hides hostels/pick-up points from options and 404s the campus endpoints", async () => {
    const o = await (await pub("/register/options")).json() as { campus: { id: string }; hostels: unknown[]; pickupPoints: unknown[] };
    expect(o.campus.id).toBe("gctu");
    expect(o.hostels.length).toBe(0);
    expect(o.pickupPoints.length).toBe(0);
    expect((await req("/api/pickup-points")).status).toBe(404);
    expect((await req("/api/help-desk")).status).toBe(404);
    expect((await pub("/help-desk/submit", { method: "POST", body: JSON.stringify({ message: "hello there" }) })).status).toBe(404);
  });
});
