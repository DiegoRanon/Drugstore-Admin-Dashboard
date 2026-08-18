import { NextResponse, type NextRequest } from "next/server";

import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from "@/lib/session/cookie";
import { ensureFreshSession } from "@/lib/session/refresh";
import { sealSession, unsealSession } from "@/lib/session/seal";
import { isIdleExpired, type Session } from "@/lib/session/types";

/**
 * Session refresh and route protection.
 *
 * In Next 16 this file is `proxy`, not `middleware`, and it always runs on the
 * Node runtime — `export const runtime` is rejected here. That suits us: PRD
 * 2.1 forbids the Edge runtime outright, because edge middleware would do
 * token exchange at whichever POP served the request, outside Canada.
 *
 * **This check is optimistic.** It exists because Server Components cannot set
 * cookies, so refresh has to happen somewhere that can write a response — but a
 * matcher change or a route move can silently remove its coverage, and Server
 * Functions are POSTs to their host route rather than routes of their own. The
 * authoritative check is `requireSession()` in the Data Access Layer, which
 * every read and every mutation goes through.
 */

const LOGIN_PATH = "/login";
const DRIVER_PATH = "/mobile-app";

/** Reachable without a session. Everything else is guarded. */
const PUBLIC_PATHS = new Set<string>([LOGIN_PATH, DRIVER_PATH]);

/** Re-seal at most once a minute so the idle clock stays accurate without
 * re-encrypting the cookie on every RSC request. */
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function signOut(request: NextRequest, reason: "idle" | "expired") {
  const response = redirectTo(request, LOGIN_PATH, { reason });
  clearSessionCookie(response);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);

  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isPublic) return NextResponse.next();
    // Remember where they were headed so the link from an email still works.
    return redirectTo(request, LOGIN_PATH, { next: pathname + search });
  }

  // A shared counter machine must not sit signed in (PRD 8.4).
  if (isIdleExpired(session)) return signOut(request, "idle");

  // The dashboard is admin-only. A driver gets a plain explanation rather than
  // a UI where every request answers 403.
  if (session.user.role !== "admin") {
    if (pathname === DRIVER_PATH) return NextResponse.next();
    return redirectTo(request, DRIVER_PATH);
  }

  if (pathname === LOGIN_PATH) return redirectTo(request, "/");

  const outcome = await ensureFreshSession(session);
  if (outcome.kind === "terminal") return signOut(request, "expired");

  const response = NextResponse.next();

  if (outcome.kind === "refreshed") {
    setSessionCookie(response, outcome.sealed);
    return response;
  }

  await touchLastSeen(response, outcome.session);
  return response;
}

async function touchLastSeen(response: NextResponse, session: Session): Promise<void> {
  const now = Date.now();
  if (now - session.lastSeenAt < LAST_SEEN_WRITE_INTERVAL_MS) return;
  setSessionCookie(response, await sealSession({ ...session, lastSeenAt: now }));
}

export const config = {
  matcher: [
    /*
     * Everything except:
     * - /api/auth  (login and logout must work without a session)
     * - Next's own static output and image optimizer
     * - favicon
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
