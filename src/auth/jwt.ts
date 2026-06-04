// Access-token signing/verification (HS256 via jose, WebCrypto-backed).
import { SignJWT, jwtVerify } from "jose";

export interface AccessScope {
  memberId?: string;
  departments: string[];
  cells: string[];
}
export interface AccessClaims {
  sub: string;
  role: string;
  scope: AccessScope;
  jti: string;
}

const ISS = "pensa-gctu";
const AUD = "pensa-gctu-admin";
const TTL = "15m";

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(
  input: { sub: string; role: string; scope: AccessScope },
  secret: string,
  kid = "v1",
): Promise<string> {
  return new SignJWT({ role: input.role, scope: input.scope, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256", kid })
    .setSubject(input.sub)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(secret), { issuer: ISS, audience: AUD });
  return {
    sub: payload.sub as string,
    role: payload.role as string,
    scope: payload.scope as AccessScope,
    jti: payload.jti as string,
  };
}
