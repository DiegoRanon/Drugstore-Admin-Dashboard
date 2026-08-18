import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { SESSION_COOKIE } from "@/lib/session/cookie";
import { unsealSession } from "@/lib/session/seal";
import { isIdleExpired, type Session } from "@/lib/session/types";

/**
 * Reads the raw cookie, tolerating the absence of a request scope.
 *
 * `cookies()` throws when called outside a request — which is exactly what the
 * `verify:api` script does. That is the only failure swallowed here.
 */
async function readSealedCookie(): Promise<string | undefined> {
  try {
    const store = await cookies();
    return store.get(SESSION_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

/**
 * The authoritative session check — `proxy.ts` is only optimistic.
 *
 * Proxy coverage can vanish through a matcher edit or a route move, and Server
 * Functions are POSTs to their host route rather than routes of their own, so a
 * matcher that excludes a path also skips its Server Actions. Every read and
 * every mutation therefore re-verifies here.
 *
 * `cache()` dedupes it across one render pass. Returns `null` rather than
 * throwing, so callers choose between redirecting and degrading.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const session = await unsealSession(await readSealedCookie());
  if (!session) return null;

  // Defence in depth: proxy already signs out an idle session, but a Server
  // Action reached without passing through proxy must not act on one.
  if (isIdleExpired(session)) return null;

  // The dashboard is admin-only; every admin endpoint would answer 403 anyway.
  if (session.user.role !== "admin") return null;

  return session;
});

/**
 * `next/navigation` is imported lazily: it pulls in the client router context,
 * which cannot load outside the Next runtime, and `npm run verify:api`
 * exercises this module from a plain Node script.
 */
async function redirectToLogin(): Promise<never> {
  const { redirect } = await import("next/navigation");
  return redirect("/login");
}

/** Sends the user to `/login` when there is nothing usable. Never retries. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (session) return session;
  return redirectToLogin();
}

export async function requireAccessToken(): Promise<string> {
  const session = await getSession();
  if (session) return session.accessToken;

  // Script escape hatch, non-production only: `npm run verify:api` exercises
  // the DAL without a browser session. Never reachable in a deployed build.
  const devToken = process.env.DEV_ACCESS_TOKEN;
  if (process.env.NODE_ENV !== "production" && devToken) return devToken;

  return redirectToLogin();
}
