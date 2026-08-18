import type { Organization, SessionUser } from "@/api/types";

/**
 * What the sealed cookie carries.
 *
 * Both tokens live here, encrypted. They are never exposed to browser
 * JavaScript: a 30-day refresh token in `localStorage` is a 30-day credential
 * to patient addresses, retrievable by any XSS, and under Law 25 that is a
 * reportable confidentiality incident (PRD 4.2).
 */
export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. Derived from `expires_in` at issue time. */
  accessExpiresAt: number;
  /** Epoch ms of the last request. Drives the 30-minute idle timeout. */
  lastSeenAt: number;
  user: SessionUser;
  organization: Organization;
};

/** Refresh this far ahead of expiry so an in-flight render never 401s. */
export const REFRESH_SKEW_MS = 60_000;

/** Shared pharmacy counters: 30 minutes idle, warned at 28 (PRD 8.4). */
export const IDLE_TIMEOUT_MS = 30 * 60_000;
export const IDLE_WARNING_MS = 28 * 60_000;

export function accessTokenIsFresh(session: Session, now = Date.now()): boolean {
  return session.accessExpiresAt - now > REFRESH_SKEW_MS;
}

export function isIdleExpired(session: Session, now = Date.now()): boolean {
  return now - session.lastSeenAt > IDLE_TIMEOUT_MS;
}
