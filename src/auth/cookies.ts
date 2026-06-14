// Hardened cookie builders for auth tokens.
// NOTE: the refresh cookie is path-scoped to /auth, so it CANNOT use the
// `__Host-` prefix (that prefix requires Path=/; browsers silently drop a
// `__Host-` cookie set with any other path). `__Secure-` allows path scoping
// while still requiring the Secure attribute.
export const AT_COOKIE = "__Host-at";
export const RT_COOKIE = "__Secure-rt";
export const CSRF_COOKIE = "__Host-csrf";

export function authCookie(name: typeof AT_COOKIE | typeof RT_COOKIE, value: string, maxAgeSec: number, path = "/"): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=${path}; Max-Age=${maxAgeSec}`;
}
export function csrfCookie(value: string): string {
  return `${CSRF_COOKIE}=${value}; Secure; SameSite=Strict; Path=/; Max-Age=86400`;
}
export function clearCookie(name: string, path = "/"): string {
  return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=${path}; Max-Age=0`;
}
export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
