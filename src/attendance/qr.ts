// Signed member QR tokens: HMAC-SHA256 over "<memberId>.<qrVersion>".
// Unforgeable and revocable (bump members.qr_version). No PII in the token.
import { b64urlEncode, timingSafeEqual } from "../auth/crypto";

async function sign(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64urlEncode(new Uint8Array(sig));
}

export async function signMemberQr(memberId: string, qrVersion: number, secret: string): Promise<string> {
  const msg = `${memberId}.${qrVersion}`;
  return `${msg}.${await sign(secret, msg)}`;
}

export async function verifyMemberQr(token: string, secret: string): Promise<{ memberId: string; qrVersion: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [memberId, qrv, sig] = parts as [string, string, string];
  const expected = await sign(secret, `${memberId}.${qrv}`);
  if (!timingSafeEqual(sig, expected)) return null;
  const qrVersion = Number(qrv);
  if (!Number.isInteger(qrVersion)) return null;
  return { memberId, qrVersion };
}
