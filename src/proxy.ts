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

/**
 * Machine traffic. These still get a token refresh, but they must not count as
 * user presence — the board polls every 10 seconds whether or not anyone is
 * standing there, and treating that as activity would defeat the idle timeout
 * entirely. `/api/session/heartbeat` is the opposite case: the client sends it
 * only in response to real interaction, so it does count.
 */
const BACKGROUND_PATHS = new Set<string>(["/api/orders/poll"]);

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

/**
 * A `fetch` from the board must not be answered with a login *page*. API routes
 * get a status the caller can act on; the client then does a full navigation and
 * lets proxy decide where the user goes.
 */
function unauthenticated(clearCookie: boolean) {
  const response = NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (clearCookie) clearSessionCookie(response);
  return response;
}

/**
 * Strict CSP with a per-request nonce (PRD 8.5).
 *
 * This is the last line of defence behind React's escaping. The dashboard
 * renders patient names and addresses, so a script injection here is a
 * confidentiality incident, not a defacement.
 *
 * `script-src` is the directive that carries the weight: no `unsafe-inline`,
 * no `unsafe-eval` in production, and `strict-dynamic` so a nonced bundle can
 * still load its own chunks without whitelisting a host.
 *
 * `style-src` keeps `unsafe-inline`, deliberately. Base UI positions popovers,
 * dialogs, and dropdowns by writing `style` attributes, which are governed by
 * `style-src-attr` and cannot carry a nonce — nothing can hash a value computed
 * from the viewport at open time. The alternative is a broken menu on every
 * screen. Injected CSS cannot execute script under this policy, so the residual
 * risk is exfiltration-by-selector, far below what the script rules close off.
 */
function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";

  return [
    "default-src 'self'",
    // React reconstructs server error stacks with `eval` in dev only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // Every API call is server-side; the browser only ever talks to this origin.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Fresh per request: a predictable nonce is no nonce at all.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);

  // Next reads the nonce back off the *request* header during render and
  // attaches it to the framework and page bundles automatically.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = await route(request, requestHeaders);

  // Set last, on whatever the routing decided — including redirects and the
  // 401s below, so no response escapes the policy.
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

async function route(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isApi = pathname.startsWith("/api/");

  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isPublic) return NextResponse.next({ request: { headers: requestHeaders } });
    if (isApi) return unauthenticated(false);
    // Remember where they were headed so the link from an email still works.
    return redirectTo(request, LOGIN_PATH, { next: pathname + search });
  }

  // A shared counter machine must not sit signed in (PRD 8.4).
  if (isIdleExpired(session)) {
    return isApi ? unauthenticated(true) : signOut(request, "idle");
  }

  // The dashboard is admin-only. A driver gets a plain explanation rather than
  // a UI where every request answers 403.
  if (session.user.role !== "admin") {
    if (pathname === DRIVER_PATH) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (isApi) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
    return redirectTo(request, DRIVER_PATH);
  }

  if (pathname === LOGIN_PATH) return redirectTo(request, "/");

  const outcome = await ensureFreshSession(session);
  if (outcome.kind === "terminal") {
    return isApi ? unauthenticated(true) : signOut(request, "expired");
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (outcome.kind === "refreshed") {
    setSessionCookie(response, outcome.sealed);
    return response;
  }

  if (!BACKGROUND_PATHS.has(pathname)) {
    await touchLastSeen(response, outcome.session);
  }

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
