import { ApiError } from "@/lib/api/errors";

import { sessionCoordinator, type SessionCoordinator } from "./coordinator";
import { sealSession, unsealSession } from "./seal";
import { accessTokenIsFresh, type Session } from "./types";

/** How long one refresh may hold the lock before it is presumed dead. */
const LOCK_TTL_MS = 10_000;
/** How long the winner's result stays available to the requests that waited. */
const HANDOFF_TTL_MS = 30_000;
/** How long a loser waits for that result before giving up. */
const WAIT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;

export type RefreshOutcome =
  | { kind: "unchanged"; session: Session }
  | { kind: "refreshed"; session: Session; sealed: string }
  /** The session is dead for good: clear the cookie and go to /login. */
  | { kind: "terminal" };

/** Keyed on the user, so every tab and every parallel fetch shares one lock. */
function lockKey(session: Session): string {
  return `refresh:${session.user.id}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls the API directly rather than through `lib/api/client`, which is
 * `server-only` and therefore unresolvable from `proxy.ts`.
 */
async function rotate(refreshToken: string): Promise<Session["user"] & { tokens: RotateTokens }> {
  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(new URL("/v1/auth/refresh", base), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) throw await ApiError.fromResponse(response);

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: Session["user"];
  };

  return {
    ...payload.user,
    tokens: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      accessExpiresAt: Date.now() + payload.expires_in * 1000,
    },
  };
}

type RotateTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
};

/**
 * Refreshes the access token if it is close to expiring, at most once per
 * session at a time.
 *
 * The requests that lose the race do not refresh; they wait for the winner's
 * result. Presenting the token the winner already rotated would look exactly
 * like a stolen-token replay and revoke the whole family.
 */
export async function ensureFreshSession(session: Session): Promise<RefreshOutcome> {
  if (accessTokenIsFresh(session)) return { kind: "unchanged", session };

  const coordinator = await sessionCoordinator();
  const key = lockKey(session);
  const token = await coordinator.acquire(key, LOCK_TTL_MS);

  if (!token) return waitForWinner(coordinator, key, session);

  try {
    // Someone may have refreshed and released just before we acquired. Our own
    // refresh token would already be rotated, so use their result instead of
    // walking into the replay trap.
    const handedOff = await readHandoff(coordinator, key, session);
    if (handedOff) return handedOff;

    const rotated = await rotate(session.refreshToken);
    const { tokens, ...user } = rotated;

    const next: Session = {
      ...session,
      ...tokens,
      user,
      // `/v1/auth/refresh` does not re-send the organization; carry it forward.
      organization: session.organization,
      // `lastSeenAt` is deliberately *not* bumped. Refreshing a token says
      // nothing about whether a human is at the counter, and a board polling
      // every 10 seconds would otherwise hold the session open forever.
    };

    const sealed = await sealSession(next);
    await coordinator.publish(key, sealed, HANDOFF_TTL_MS);
    return { kind: "refreshed", session: next, sealed };
  } catch (error) {
    // A rejected refresh token is terminal. Never retry: the server has
    // already revoked the family, and a second attempt only confirms it.
    if (error instanceof ApiError && error.status === 401) return { kind: "terminal" };
    // A transient failure (API down) must not sign the user out. Let the
    // request proceed; the DAL will surface the error if the token has expired.
    return { kind: "unchanged", session };
  } finally {
    await coordinator.release(key, token);
  }
}

/** A published session is only useful if it is newer than the one we hold. */
async function readHandoff(
  coordinator: SessionCoordinator,
  key: string,
  current: Session,
): Promise<RefreshOutcome | null> {
  const sealed = await coordinator.read(key);
  if (!sealed) return null;

  const published = await unsealSession(sealed);
  if (!published || published.accessExpiresAt <= current.accessExpiresAt) return null;

  return { kind: "refreshed", session: published, sealed };
}

async function waitForWinner(
  coordinator: SessionCoordinator,
  key: string,
  session: Session,
): Promise<RefreshOutcome> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const handedOff = await readHandoff(coordinator, key, session);
    if (handedOff) return handedOff;
    await sleep(POLL_INTERVAL_MS);
  }

  // The winner died or is very slow. Proceed with the token we have rather
  // than issuing a second refresh — a 401 is recoverable, a revoked family is
  // not.
  return { kind: "unchanged", session };
}
