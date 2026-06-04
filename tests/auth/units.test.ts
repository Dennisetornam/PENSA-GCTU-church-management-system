import { describe, it, expect } from "vitest";
import { randomToken, sha256Hex, timingSafeEqual } from "../../src/auth/crypto";
import { hashPassword, verifyPassword } from "../../src/auth/password";
import { signAccessToken, verifyAccessToken } from "../../src/auth/jwt";
import { can } from "../../src/rbac/permissions";

const SECRET = "test-secret-at-least-32-bytes-long-xxxxx";

describe("Module 2 — crypto", () => {
  it("randomToken is url-safe and unique", () => {
    const a = randomToken(), b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("sha256Hex matches a known vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("timingSafeEqual", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
});

describe("Module 2 — password hashing", () => {
  it("verifies correct and rejects wrong", async () => {
    const enc = await hashPassword("correct horse battery staple", 10_000);
    expect(enc.startsWith("pbkdf2$sha256$10000$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", enc)).toBe(true);
    expect(await verifyPassword("nope", enc)).toBe(false);
  });
  it("uses a fresh salt each time", async () => {
    expect(await hashPassword("same", 10_000)).not.toBe(await hashPassword("same", 10_000));
  });
});

describe("Module 2 — access JWT", () => {
  it("round-trips claims", async () => {
    const t = await signAccessToken({ sub: "u1", role: "church_admin", scope: { departments: [], cells: [] } }, SECRET);
    const c = await verifyAccessToken(t, SECRET);
    expect(c.sub).toBe("u1");
    expect(c.role).toBe("church_admin");
  });
  it("rejects a wrong secret", async () => {
    const t = await signAccessToken({ sub: "u1", role: "church_admin", scope: { departments: [], cells: [] } }, SECRET);
    await expect(verifyAccessToken(t, "another-secret-at-least-32-bytes-long-y")).rejects.toThrow();
  });
});

describe("Module 2 — RBAC (4 roles)", () => {
  it("super_admin manages roles; church_admin cannot", () => {
    expect(can("super_admin", "roles:manage")).toBe("all");
    expect(can("church_admin", "roles:manage")).toBe(false);
  });
  it("leaders are scoped", () => {
    expect(can("department_leader", "members:read")).toBe("department");
    expect(can("cell_leader", "attendance:record")).toBe("cell");
  });
  it("church_admin reviews registrations; leaders cannot", () => {
    expect(can("church_admin", "registrations:review")).toBe("all");
    expect(can("department_leader", "registrations:review")).toBe(false);
  });
});
