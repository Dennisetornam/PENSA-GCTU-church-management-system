// Cloudflare Turnstile server-side verification.
const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteip?: string,
): Promise<boolean> {
  if (!token || !secret) return false;
  const body = new FormData();
  body.append("secret", secret.trim());
  body.append("response", token.trim());
  if (remoteip) body.append("remoteip", remoteip);
  const res = await fetch(ENDPOINT, { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
