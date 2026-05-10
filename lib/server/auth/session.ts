import { SignJWT, jwtVerify } from "jose";
import { resolveAuthSecret } from "@/lib/server/auth/resolve-auth-secret";

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(resolveAuthSecret());
}

export async function createSession(userId: string) {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as { userId: string };
  } catch {
    return null;
  }
}
