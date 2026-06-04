// PBKDF2-HMAC-SHA256 password hashing via WebCrypto (Workers-native, no deps).
// Encoded as: pbkdf2$sha256$<iterations>$<salt_b64url>$<hash_b64url>
import { b64urlEncode, b64urlDecode, timingSafeEqual } from "./crypto";

const DEFAULT_ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return b64urlEncode(new Uint8Array(bits));
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${b64urlEncode(salt)}$${hash}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[2]);
  const salt = b64urlDecode(parts[3]!);
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, parts[4]!);
}
