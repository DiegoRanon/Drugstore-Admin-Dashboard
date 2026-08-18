import { EncryptJWT, jwtDecrypt } from "jose";

import type { Session } from "./types";

/**
 * Seals the session into a JWE (`dir` + `A256GCM`).
 *
 * Direct encryption with a symmetric key: this app both writes and reads the
 * blob, so there is no key-agreement problem to solve, and AES-GCM gives
 * confidentiality and integrity in one pass. The cookie is opaque even to
 * someone who can read it off disk.
 *
 * No `server-only` import here on purpose — `proxy.ts` is not a React Server
 * Component and would fail to resolve it.
 */

/** 30 days, matching the server's refresh TTL. Never longer. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

let cachedKey: Uint8Array | null = null;

function encryptionKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const key = Buffer.from(secret, "base64");
  if (key.byteLength !== 32) {
    throw new Error(
      `SESSION_SECRET must decode to exactly 32 bytes for A256GCM (got ${key.byteLength}).`,
    );
  }

  cachedKey = new Uint8Array(key);
  return cachedKey;
}

export async function sealSession(session: Session): Promise<string> {
  return new EncryptJWT({ session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .encrypt(encryptionKey());
}

/**
 * Returns `null` for anything that is not a session we sealed — tampered,
 * expired, encrypted under a rotated key, or simply absent. Callers treat all
 * of those the same way: send the user to `/login`.
 */
export async function unsealSession(sealed: string | undefined): Promise<Session | null> {
  if (!sealed) return null;

  try {
    const { payload } = await jwtDecrypt(sealed, encryptionKey());
    const session = (payload as { session?: Session }).session;
    if (!session?.accessToken || !session.refreshToken || !session.user) return null;
    return session;
  } catch {
    return null;
  }
}
